from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
import json
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from zellige.server import build_app
from zellige.service import ServiceError


class RunnerTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.app = build_app(Path(self.temp.name), "secret")
        self.client = TestClient(self.app, headers={"Authorization": "Bearer secret"})
        self.service = self.app.state.service
        self.database = self.service.database
        self.conversation = self.client.post('/v1/conversations', json={}).json()
        self.cid = self.conversation['conversation']['id']
        self.bid = self.conversation['branch']['id']
        self.profile = self.client.post('/v1/runtime-profiles', json={
            'name': 'Codex', 'definition': {'harness': 'codex', 'workspace': '.'},
        }).json()

    def tearDown(self):
        self.client.close()
        self.temp.cleanup()

    def queue(self, **overrides):
        body = dict(conversation_id=self.cid, branch_id=self.bid,
                    runtime_profile_version_id=self.profile['version']['id'])
        body.update(overrides)
        response = self.client.post('/v1/runs', json=body)
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def claim(self, harness='codex'):
        response = self.client.post('/v1/runner/runs/claim', json={'harness': harness})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()['work']

    def append(self, head, text):
        response = self.client.post(f'/v1/conversations/{self.cid}/branches/{self.bid}/items', json={
            'expected_head_item_id': head, 'kind': 'message',
            'payload': {'type': 'message', 'role': 'user', 'content': [{'type': 'text', 'text': text}]},
        })
        self.assertEqual(response.status_code, 201)
        return response.json()

    def run_changes(self, run_id):
        return [change for change in self.service.changes(0, 1000)['changes']
                if change['entity_type'] == 'run' and change['entity_id'] == run_id]

    def test_empty_and_matching_harness_only(self):
        self.assertIsNone(self.claim())
        for name, definition in [('legacy', {'mode': 'code'}), ('other', {'harness': 'other'})]:
            profile = self.client.post('/v1/runtime-profiles', json={'name': name, 'definition': definition}).json()
            self.queue(runtime_profile_version_id=profile['version']['id'])
        self.assertIsNone(self.claim())
        match = self.queue()
        self.assertEqual(self.claim()['run']['id'], match['id'])
        self.assertIsNone(self.claim())
        self.assertEqual(self.claim('other')['runtime_profile_version']['definition']['harness'], 'other')

    def test_oldest_and_tie_by_id(self):
        for run_id in ['z', 'a', 'older']:
            self.queue(id=run_id)
        with self.database.transaction(immediate=True) as connection:
            connection.execute("UPDATE runs SET created_at = CASE WHEN id = 'older' THEN 1 ELSE 2 END")
        self.assertEqual([self.claim()['run']['id'] for _ in range(3)], ['older', 'a', 'z'])

    def test_claim_concurrently_once_and_start_change(self):
        queued = self.queue()
        barrier = threading.Barrier(2)
        def claim():
            barrier.wait()
            return self.service.claim_run('codex')['work']
        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(lambda _: claim(), range(2)))
        work = [value for value in results if value is not None]
        self.assertEqual(len(work), 1)
        run = work[0]['run']
        self.assertEqual(run['id'], queued['id'])
        self.assertEqual(run['status'], 'running')
        self.assertIsNotNone(run['started_at'])
        self.assertIsNone(run['completed_at'])
        self.assertIsNone(run['result'])
        self.assertIsNone(self.claim())
        self.assertEqual([entry['data']['status'] for entry in self.run_changes(run['id'])], ['queued', 'running'])
        self.assertEqual(self.run_changes(run['id'])[-1]['data'], run)

    def test_concurrent_finish_has_one_winner_and_one_terminal_change(self):
        queued = self.queue()
        self.claim()
        barrier = threading.Barrier(2)

        def finish(status):
            barrier.wait()
            try:
                return self.service.finish_run(queued['id'], {
                    'status': status, 'result': {'summary': status},
                })
            except ServiceError as error:
                return error

        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(finish, ['completed', 'failed']))
        winners = [result for result in results if isinstance(result, dict)]
        conflicts = [result for result in results if isinstance(result, ServiceError)]
        self.assertEqual(len(winners), 1)
        self.assertEqual(len(conflicts), 1)
        self.assertEqual(conflicts[0].status, 409)
        changes = self.run_changes(queued['id'])
        self.assertEqual(len(changes), 3)
        self.assertEqual(changes[-1]['data'], winners[0])
        self.assertEqual(self.service.list_runs(self.cid)['runs'][0], winners[0])

    def test_snapshot_exact_versions_and_order(self):
        first = self.append(None, 'root')
        second = self.append(first['id'], 'pinned request')
        packs = [self.client.post('/v1/context-packs', json={'name': name, 'manifest': {'name': name}}).json()
                 for name in ['A', 'B']]
        pinned = [packs[1]['version']['id'], packs[0]['version']['id']]
        queued = self.queue(context_pack_version_ids=pinned)
        self.append(second['id'], 'later request must be absent')
        with self.database.transaction(immediate=True) as connection:
            connection.execute('INSERT INTO runtime_profile_versions VALUES (?, ?, ?, ?, ?)',
                               ('new-profile', self.profile['runtime_profile']['id'], 2, json.dumps({'harness': 'other'}), 1))
        self.client.post(f"/v1/context-packs/{packs[0]['context_pack']['id']}/versions", json={'manifest': {'latest': True}})
        work = self.claim()
        self.assertEqual(work['run']['input_head_item_id'], queued['input_head_item_id'])
        self.assertEqual(work['items'], [first, second])
        self.assertEqual(work['runtime_profile_version'], self.profile['version'])
        self.assertEqual(work['context_pack_versions'], [packs[1]['version'], packs[0]['version']])
        self.assertEqual(work['run']['context_pack_version_ids'], pinned)

    def test_null_input_stays_empty_after_append(self):
        self.queue()
        self.append(None, 'later')
        self.assertEqual(self.claim()['items'], [])

    def test_exact_legacy_profile_does_not_match_latest(self):
        legacy = self.client.post('/v1/runtime-profiles', json={'name': 'Legacy', 'definition': {}}).json()
        self.queue(runtime_profile_version_id=legacy['version']['id'])
        with self.database.transaction(immediate=True) as connection:
            connection.execute('INSERT INTO runtime_profile_versions VALUES (?, ?, ?, ?, ?)',
                               ('new-codex', legacy['runtime_profile']['id'], 2, '{"harness":"codex"}', 1))
        self.assertIsNone(self.claim())

    def test_finish_both_statuses_preserves_references_and_changes(self):
        for status in ['completed', 'failed']:
            with self.subTest(status=status):
                self.queue()
                running = self.claim()['run']
                result = {'summary': 'done', 'execution': {'thread_id': 'native'}} if status == 'completed' else {'error': 'failure'}
                response = self.client.post(f"/v1/runner/runs/{running['id']}/finish", json={'status': status, 'result': result})
                self.assertEqual(response.status_code, 200)
                finished = response.json()
                for key in running.keys() - {'status', 'result', 'completed_at'}:
                    self.assertEqual(finished[key], running[key])
                self.assertEqual(finished['result'], result)
                self.assertEqual(finished['status'], status)
                self.assertGreaterEqual(finished['completed_at'], finished['started_at'])
                changes = self.run_changes(running['id'])
                self.assertEqual([entry['data']['status'] for entry in changes], ['queued', 'running', status])
                self.assertEqual(changes[-1]['data'], finished)
                self.assertEqual(self.client.post(f"/v1/runner/runs/{running['id']}/finish", json={'status': status, 'result': {}}).status_code, 409)

    def test_finish_conflicts_unknown_validation_auth(self):
        queued = self.queue()
        body = {'status': 'completed', 'result': {}}
        self.assertEqual(self.client.post(f"/v1/runner/runs/{queued['id']}/finish", json=body).status_code, 409)
        self.assertEqual(self.client.post('/v1/runner/runs/missing/finish', json=body).status_code, 404)
        self.assertEqual(self.client.post('/v1/runner/runs/claim', json={'harness': ''}).status_code, 400)
        self.assertEqual(self.client.post(f"/v1/runner/runs/{queued['id']}/finish", json={'status': 'running', 'result': {}}).status_code, 400)
        for path, data in [('/v1/runner/runs/claim', {'harness': 'codex'}), (f"/v1/runner/runs/{queued['id']}/finish", body)]:
            self.assertEqual(self.client.post(path, json=data, headers={'Authorization': 'Bearer wrong'}).status_code, 401)

    def test_outbox_failure_rolls_back_claim_and_finish(self):
        queued = self.queue()
        with patch.object(self.service, '_change', side_effect=RuntimeError('outbox unavailable')):
            with self.assertRaises(RuntimeError):
                self.service.claim_run('codex')
        self.assertEqual(self.service.list_runs(self.cid)['runs'][0]['status'], 'queued')
        self.claim()
        with patch.object(self.service, '_change', side_effect=RuntimeError('outbox unavailable')):
            with self.assertRaises(RuntimeError):
                self.service.finish_run(queued['id'], {'status': 'completed', 'result': {}})
        self.assertEqual(self.service.list_runs(self.cid)['runs'][0]['status'], 'running')

    def test_broken_ancestry_and_cancelled_finish(self):
        first = self.append(None, 'root')
        queued = self.queue()
        connection = self.database.connect()
        try:
            connection.execute('PRAGMA foreign_keys = OFF')
            connection.execute('DROP TRIGGER items_no_update')
            connection.execute('UPDATE items SET parent_item_id = ? WHERE id = ?', ('missing', first['id']))
        finally:
            connection.close()
        with self.assertRaises(ServiceError) as error:
            self.service.claim_run('codex')
        self.assertEqual(error.exception.code, 'broken_history')
        with self.assertRaises(ServiceError) as history_error:
            self.service.history(self.cid, self.bid)
        self.assertEqual(history_error.exception.code, 'broken_history')
        self.assertEqual(self.service.list_runs(self.cid)['runs'][0]['status'], 'queued')
        with self.database.transaction(immediate=True) as connection:
            connection.execute("UPDATE runs SET status = 'cancelled' WHERE id = ?", (queued['id'],))
        response = self.client.post(f"/v1/runner/runs/{queued['id']}/finish", json={'status': 'completed', 'result': {}})
        self.assertEqual(response.status_code, 409)

    def test_shared_ancestry_errors_roll_back_claim(self):
        first = self.append(None, 'root')
        self.queue()
        with self.database.transaction(immediate=True) as connection:
            connection.execute('DROP TRIGGER items_no_update')
            connection.execute('UPDATE items SET parent_item_id = id WHERE id = ?', (first['id'],))
        with self.assertRaises(ServiceError) as error:
            self.service.claim_run('codex')
        self.assertEqual(error.exception.code, 'history_cycle')
        self.assertEqual(self.client.get(f'/v1/conversations/{self.cid}/branches/{self.bid}/history').status_code, 500)
        self.assertEqual(self.service.list_runs(self.cid)['runs'][0]['status'], 'queued')
