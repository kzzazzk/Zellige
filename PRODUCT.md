# Zellige

<!-- impeccable:product-schema 1 -->

## Platform

web

## Product Purpose

An open-source, self-hosted workspace for portable conversations. General chat,
coding, research and personal agents are execution profiles, not separate histories.

## Operating Context

Clients on multiple devices connect to an authenticated daemon. Only that daemon
owns SQLite. Provider credentials and optional native sessions remain separate
from canonical conversation data.

## Capabilities and Constraints

The current app manages conversations, immutable messages, branches, profiles
and queued runs. Edits fork history; archives are reversible. No AI runner,
streaming replies, accounts or automatic synchronization is implemented yet.
See README.md and docs/architecture/database.md for the authoritative scope.

## Brand Commitments

The user requested a conversation-first interface inspired by T3 Code, using
shadcn components. The supplied mascot moodboard defines the identity: ceramic
blue/teal/ivory shapes with brass seams, deep navy surfaces and a friendly star
companion. A separate minimal static marketing page lives in `marketing/`.
