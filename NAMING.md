# Naming & Project Identity

This project is currently known by three different names depending on where you look.
They all refer to the **same project**:

| Name | Where it appears |
|---|---|
| **Quantum Armor Vault (QAV)** | Canonical product name — component READMEs and the Rust crate (`usbvault-crypto`) |
| **`Quantum_Shield`** | GitHub repository (`007Byte/Quantum_Shield`), CI badge URLs |
| **USBVault Enterprise** | Mobile/desktop app display name |

In addition, code namespaces use `usbvault-*` (e.g. `usbvault-app`, `usbvault-server`,
`usbvault-crypto`, `@usbvault/*` packages) and some docs refer to the product simply as
"USBVault."

## Why this matters

If you are reading the repo, an issue, a runbook, or a store listing, these names are
interchangeable. `security@usbvault.io` and `https://usbvault.io` belong to the same
project as the `Quantum_Shield` repository and the "Quantum Armor Vault (QAV)" product.

## Scope

A full rename to a single canonical name (across the repo directory tree, package
namespaces, CI badge URLs, i18n locale strings, runbooks, and store listings) is
**out of scope for now**. This document exists to remove ambiguity until that
consolidation happens. When a canonical name is chosen, update this file and migrate the
remaining references.
