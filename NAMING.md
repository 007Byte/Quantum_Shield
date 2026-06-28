# Naming & Project Identity

The canonical product name is **Quantum_Shield**. Everything in this repository — the
GitHub repository (`007Byte/Quantum_Shield`), the mobile/desktop app, the server, the
crypto core, and the marketing site — is one product, and that product is called
**Quantum_Shield**.

## Product name vs. code namespace

There are two distinct things here, and only one of them is the "name":

| | Value | Rule |
|---|---|---|
| **Product name** (human-facing) | **Quantum_Shield** | Use everywhere a human reads the product's name: docs, READMEs, store listings, the WebAuthn relying-party display name, app UI copy. |
| **Code namespace** (machine-facing) | `usbvault-*` | Do **not** rename. It is wired into builds, imports, deploys, and credentials. |

The `usbvault-*` namespace is an implementation identity, not the product name, and it is
**deliberately kept**:

- package / directory / crate names: `usbvault-server`, `usbvault-app`, `usbvault-crypto`,
  `usbvault-companion`, `electron-shell`, `landing`, and the `@usbvault/*` npm scope
- the Go module path `github.com/usbvault/usbvault-server` and all import paths
- domains and emails: `usbvault.io`, `app.usbvault.io`, `api.usbvault.io`,
  `security@usbvault.io`
- the WebAuthn **RPID** `usbvault.io` (a stable origin identifier — changing it would
  invalidate every existing passkey), the on-disk `VAULT.bin` magic, env-var names
  (`USBVAULT_*`, `OIDC_*`, `FIDO2_*`), Kubernetes namespaces, and Helm chart names

## History

The product was previously referred to by several names — "Quantum Armor Vault (QAV)",
"QAV", and "USBVault Enterprise". Those are **retired aliases**; all of them have been
consolidated to **Quantum_Shield**. The bare word "USBVault" survives only as part of the
`usbvault-*` code namespace described above, never as the product name.

If you find a lingering "QAV" / "Quantum Armor Vault" / "USBVault Enterprise" in a
human-facing string, it is a leftover — replace it with **Quantum_Shield**. If you find
`usbvault-*` in code, a path, a domain, an env var, or the RPID, **leave it**.
