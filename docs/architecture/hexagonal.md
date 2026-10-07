# Backend architecture: ports and adapters

The backend follows the hexagonal architecture described in
[Cockburn's ports and adapters article](https://alistair.cockburn.us/hexagonal-architecture/),
with the package layout common in Spring Boot hexagonal projects. The hexagon
is `domain/` plus `application/`. Everything that touches a framework, a driver
or the operating system lives in `adapter/`, and `config/` wires adapters to
the hexagon.

- **What the application offers.** An entry adapter, such as the HTTP
  controllers in `adapter/web/`, calls a use case interface in
  `application/usecase/`. An application service implements that interface.
- **What the application needs.** A service needs storage, binary files and
  time. It declares those needs as ports in `application/port/`; the adapters
  in `adapter/persistence/`, `adapter/storage/` and `adapter/clock/` implement
  them.

Adapters are grouped by technology. Each technology either calls use cases or
implements ports, and `tests/test_architecture.py` declares which.

The domain and application import neither FastAPI nor SQLite. Adapters depend
on ports, never on services, on another adapter or on configuration.

Each module holds one concept. Classes with behavior, such as services,
repository implementations and controllers, have their own module. Small data
classes that are read and changed together share one: a use case module holds
its interface, commands and results; a repository port holds its read-only
queries and write operations; a DTO module holds one resource's requests and
responses. Package `__init__.py` files expose imports; they contain no class definitions or
business logic. Dependencies are injected through constructors. Dataclasses
generate constructors and standard methods for typed state and contracts.

```text
zellige/
├── domain/                       # Hexagon core, no I/O
│   ├── model/                    # Entities, identifiers and value types
│   │   └── payload.py            # Canonical item payload schemas
│   ├── service/                  # Business rules spanning entities
│   └── exception/                # InvalidError, NotFoundError, ConflictError, InternalError
├── application/
│   ├── usecase/                  # One module per area: *UseCase, commands, results
│   ├── port/                     # Clock, BlobStore
│   │   └── persistence/          # UnitOfWork, repositories with their queries
│   └── service/                  # Use case implementations, transaction boundaries, lookups
├── adapter/
│   ├── web/                      # Calls use cases: FastAPI
│   │   ├── controller/
│   │   ├── dto/
│   │   ├── exception/            # HTTPError, GlobalExceptionHandler
│   │   ├── security/             # BearerAuthentication
│   │   ├── filter/               # RequestSizeFilter
│   │   └── http_application.py
│   ├── persistence/
│   │   └── sqlite/               # Implements ports: repositories and transactions
│   ├── storage/                  # Implements ports: FileBlobStore
│   └── clock/                    # Implements ports: SystemClock
├── config/                       # ZelligeConfiguration: adapter selection and wiring
└── server.py                     # Process entry point
```

For readers coming from Spring Boot:

| Spring Boot | Zellige |
| --- | --- |
| `@SpringBootApplication` main class | `server.py` (`main`, `build_app`) |
| `@Configuration` / `@Bean` methods | `config/zellige_configuration.py` |
| `@RestController` | `adapter/web/controller/` |
| Request/response DTOs | `adapter/web/dto/` |
| `@RestControllerAdvice` | `adapter/web/exception/global_exception_handler.py` |
| Security filter chain | `adapter/web/security/bearer_authentication.py` |
| `OncePerRequestFilter` | `adapter/web/filter/request_size_filter.py` |
| `XxxUseCase` interface, commands and results | `application/usecase/*.py` (`Protocol`, dataclasses) |
| `@Service implements XxxUseCase` | `application/service/*_service.py` |
| `XxxPort` / repository interface | `application/port/` |
| Persistence adapter / `@Repository` | `adapter/persistence/sqlite/` |
| `RowMapper` | `adapter/persistence/sqlite/row_mapper.py` |
| `throw new NotFoundException(...)` | `raise NotFoundError("branch_not_found", ...)` |
| `@Transactional` | `UnitOfWork.read()` / `write()` scopes in services |

## Reading the code

Follow a conversation update through these files, relative to `zellige/`:

1. `adapter/web/controller/conversation_controller.py`:
   `ConversationController` maps the validated HTTP request to an
   `UpdateConversation` command and calls `ConversationUseCase`.
2. `application/usecase/conversation.py`: the `ConversationUseCase` interface
   the controller depends on, with its commands and results.
3. `application/service/conversation_service.py`: `ConversationService`
   implements the use case. It opens a unit of work and loads the conversation
   through `ConversationRepository`.
4. `domain/model/conversation.py`: `Conversation.revise` checks the expected
   version, applies the requested changes and produces the updated entity.
5. `application/port/persistence/conversation_repository.py`: the port the
   service saves through.
6. `adapter/persistence/sqlite/sqlite_conversation_repository.py`:
   `SQLiteConversationRepository.save` persists the entity and its change event
   in the transaction opened by the application service.

The service receives repository contracts through `UnitOfWork`; configuration
selects the SQLite implementation. A pure domain service such as
`domain/service/item_history.py` reconstructs ordered ancestry without knowing
about transactions or SQL. An application service calls that rule and supplies
items loaded through a repository.

| Concept | Location and responsibility |
| --- | --- |
| Entity | `domain/model/`: canonical state and rules concerning that state, such as conversation revisions and branch heads. |
| Domain service | `domain/service/`: business rules spanning entities, including ordered history reconstruction. |
| Use case | `application/usecase/`: use case interfaces with their commands and results. `Zellige` groups every use case for entry adapters. |
| Application service | `application/service/`: use case implementations that coordinate domain rules, repositories and transactions. |
| Port | `application/port/`: clock, binary storage, unit of work and typed repository contracts; no SQL or connection management. |
| Synchronization record | `application/port/persistence/change_repository.py`: persisted changes with cursors, exposed through the synchronization use case. |
| Controller | `adapter/web/controller/`: routes, request-to-command mapping and response mapping. |
| HTTP DTO | `adapter/web/dto/`: Pydantic request and response models, plus schema export. |
| Repository implementation | `adapter/persistence/sqlite/`: SQL, row decoding and transactional change records. |
| Configuration | `config/`: implementation selection and constructor wiring. |

The entities are ordinary business classes, without ORM annotations or database
connections. Each entity is built through its `create` factory, which generates
missing identifiers and validates its input; services do not assemble entities
field by field. Supporting rules stay in domain services and validators; rules
concerning an entity's own state stay on that entity.

Failures are raised as `InvalidError`, `NotFoundError`, `ConflictError` or
`InternalError`, all subclasses of `DomainError`. Their code must be one of the
`ErrorCode` literals in `domain/exception/domain_error.py`, so mypy rejects a
misspelled or undeclared code. The HTTP adapter maps the error kind to its
status. Lookups that fail the same way in several services, such as a missing
conversation or branch, live in `application/service/lookups.py`.

Each service subclasses the `Protocol` of its use case, so mypy checks the
implementation against the contract. `ZelligeConfiguration.use_cases` injects
the unit of work, blob store and clock into the services and returns them as a
`Zellige`. `ZelligeConfiguration.build` chooses the SQLite, file and system
clock adapters. The HTTP adapter receives `Zellige` and never imports a service
or the configuration.

Change-feed records describe stored snapshots and contain a database-assigned
sequence. They belong to the persistence port that produces them. The `data` of
each record is a public sync contract: `adapter/persistence/sqlite/change_data.py`
lists the published fields of every entity type explicitly, so renaming an
entity field cannot silently change what clients receive, and a test fixes
those fields. Records are timestamped with the injected clock, like entities. They are not
business events raised by entities; a domain event model can be added when an
actual business use case requires one.

## Contracts and transactions

- **Application services own transaction boundaries.** A service opens
  `unit_of_work.read()` or `unit_of_work.write()`. Each scope yields named
  repositories sharing one transaction. Read scopes expose query contracts and
  observe one consistent snapshot. SQLite write scopes use `BEGIN IMMEDIATE`;
  constraint failures, including those detected at commit, become
  `PersistenceConflict`.
- **Writes across repositories are atomic.** An item append checks the expected
  branch head and run membership, inserts the item and artifact links, advances
  the branch and touches the conversation. The SQLite repositories record
  their change events on the same connection. A failure rolls back the entire
  operation. Repositories neither open their own transactions nor commit
  independently.
- **Entities contain their rules.** `Conversation.revise` checks optimistic
  concurrency and archiving; `Branch.check_head` detects stale appends;
  `Branch.advance_head` and `Conversation.touch` advance versions even when the
  clock moves backwards. Application services coordinate persistence around
  those rules.
- **Dependencies point towards the hexagon.** The domain imports no
  application, adapter or configuration code. The application imports domain
  classes, its use cases and its ports, never adapters. Use cases and ports
  never import services, and ports never import use cases. Entry adapters
  import use cases; the other adapters implement ports. No adapter imports
  another adapter, a service, the other side's contracts or the
  configuration. Only the composition root imports adapters. HTTP errors are
  mapped from `DomainError`. Domain payload classes define the canonical schema reused by
  API validation and schema export.
- **Contracts use typed classes.** Commands, results and stored entities have
  explicit fields. SQLite rows are decoded field by field in
  `row_mapper.py`. Generic JSON is
  reserved for extensible payloads, profile definitions, run requests/results and change data. Frozen dataclasses prevent field
  reassignment; nested JSON objects and lists remain mutable.
- **Artifact bytes precede metadata.** A database failure may leave an
  unreferenced blob; uploading the same bytes again completes the operation.
  Identical uploads keep the first stored metadata. Blob garbage collection is
  not implemented yet.

Repository ports cover conversations, branches, items, runs, runtime profiles,
artifacts and change queries. A profile repository persists the profile and its
versions.
Boundaries follow related operations rather than requiring a separate
repository for every database table.

## Extending the backend

For a new operation, add its command and result, the method on the use case
and its service implementation, an entity or domain service rule if needed,
the repository port operation and its SQLite implementation, and the
controller mapping. Business decisions belong in the domain; orchestration
belongs in the application service; SQL belongs in the SQLite adapter. A change
to the HTTP API fails the contract test until `uv run zellige-export-openapi`
regenerates `schemas/openapi.json`; review that diff like any other code.

A frontend uses the HTTP API (`/openapi.json`) and syncs through `GET /v1/changes`.
A CLI or MCP adapter goes in `adapter/<name>/` and is declared as an entry
adapter in `tests/test_architecture.py`; it receives the use cases it needs and
passes commands to them. A different database adapter goes in
`adapter/persistence/<name>/` and implements the repository and unit-of-work
ports, including their snapshot and atomicity guarantees; configuration then
injects it into the existing services.

## Verification

`PYTHONDONTWRITEBYTECODE=1 uv run --locked python -m unittest discover -s tests -v`
covers entity rules, payload validation, artifact identity, application commands,
read snapshots and ordered run inputs. Transaction tests exercise rollback
across repositories after a late write failure and a deferred constraint failure
at commit. API tests exercise production wiring, authentication, serialization,
concurrency, migrations and restart persistence. The checked-in
`schemas/openapi.json` and the published change-feed fields are compared on
every run, so an unintended API change fails a test.

`tests/test_architecture.py` checks import boundaries, including relative
imports. It rejects core dependencies on adapters, use case and port
dependencies on services, and adapter dependencies on services, on other
adapters, on the other side's contracts or on configuration. It also fixes the
top-level folders of the hexagon, so a new module cannot land outside
`domain/`, `application/`, `adapter/` or `config/`, and a new adapter must be
declared as calling use cases or implementing ports.
This catches architecture regressions that can leave API behavior unchanged.

`PYTHONDONTWRITEBYTECODE=1 uv run --locked mypy` checks the backend contracts,
including services against their use cases, HTTP mappings and repository
implementations. Runtime validation remains responsible for external input and
business rules. `uv run --locked ruff check .` and `uv run --locked ruff format
--check .` enforce linting, import order and formatting; CI runs all three.
