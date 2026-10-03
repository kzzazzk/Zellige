"""Worker HTTP and entrypoint tests; all execution is fake."""
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch
from urllib.error import HTTPError, URLError

from zellige.worker import APIClient, NoRedirect, main


class WorkerHTTPTest(unittest.TestCase):
    def test_authenticated_fixed_harness_and_finish(self):
        client = APIClient('http://localhost:8787', 'secret')
        response = Mock()
        response.__enter__ = Mock(return_value=io.StringIO('{"work":null}'))
        response.__exit__ = Mock(return_value=False)
        with patch.object(client.opener, 'open', return_value=response) as post:
            self.assertIsNone(client.claim())
        request = post.call_args.args[0]
        self.assertEqual(request.full_url, 'http://localhost:8787/v1/runner/runs/claim')
        self.assertEqual(request.get_header('Authorization'), 'Bearer secret')
        self.assertEqual(json.loads(request.data), {'harness': 'codex'})
        with patch.object(client, 'post') as post:
            client.finish('a/b', 'failed', {'error': 'test'})
        self.assertEqual(post.call_args.args, ('/v1/runner/runs/a%2Fb/finish', {'status': 'failed', 'result': {'error': 'test'}}))

    def test_http_errors_hide_token_and_redirects_refused(self):
        client = APIClient('http://localhost:8787', 'secret')
        for error in [HTTPError('secret', 409, 'secret', {}, None), URLError('secret')]:
            with patch.object(client.opener, 'open', side_effect=error), self.assertRaises(RuntimeError) as raised:
                client.claim()
            self.assertNotIn('secret', str(raised.exception))
        self.assertIsNone(NoRedirect().redirect_request(None, None, 302, '', {}, 'http://other'))
        for token in ['', '\nsecret', 'secret\r']:
            with self.assertRaises(ValueError):
                APIClient('http://localhost', token)

    def test_once_empty_or_claimed_and_ambiguous_http_stops(self):
        with tempfile.TemporaryDirectory() as directory:
            args = ['--token', 'secret', '--workspace-root', directory, '--once']
            for claimed in [False, True]:
                with patch('zellige.worker.APIClient') as client, patch('zellige.worker.run_once', return_value=claimed) as once:
                    self.assertEqual(main(args), 0)
                    once.assert_called_once_with(client.return_value, Path(directory).resolve())
            with patch('zellige.worker.APIClient'), patch('zellige.worker.run_once', side_effect=RuntimeError('secret')) as once, patch('sys.stderr', new_callable=io.StringIO) as stderr:
                self.assertEqual(main(args), 1)
                once.assert_called_once()
                self.assertNotIn('secret', stderr.getvalue())

    def test_no_automatic_finish_retry_after_execution(self):
        from zellige.worker import run_once
        client = Mock(token='secret')
        client.claim.return_value = {'run': {'id': 'run'}}
        client.finish.side_effect = RuntimeError('HTTP operation failed')
        with patch('zellige.worker.execute_work', return_value=('failed', {'error': 'test'})) as execution, self.assertRaises(RuntimeError):
            run_once(client, Path('/tmp'))
        client.claim.assert_called_once()
        execution.assert_called_once()
        client.finish.assert_called_once()
