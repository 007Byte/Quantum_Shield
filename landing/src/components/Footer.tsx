import Image from "next/image";

const footerColumns: { title: string; links: { label: string; href?: string }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Vault" },
      { label: "Encryption" },
      { label: "Password Manager" },
      { label: "Sharing" },
      { label: "Pricing", href: "#pricing" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About" },
      { label: "Blog" },
      { label: "Careers" },
      { label: "Press" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy" },
      { label: "Terms of Service" },
      { label: "Security" },
      { label: "Cookie Policy" },
    ],
  },
  {
    title: "Connect",
    links: [
      { label: "Twitter/X" },
      { label: "GitHub" },
      { label: "Discord" },
      { label: "Email", href: "mailto:ultimatepqcshield@gmail.com" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="relative pt-8 pb-12">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {footerColumns.map((column) => (
            <div key={column.title}>
              <h3 className="text-vault-text font-semibold text-sm uppercase tracking-wider mb-4">
                {column.title}
              </h3>
              <ul className="space-y-2">
                {column.links.map((link) => (
                  <li key={link.label}>
                    {link.href ? (
                      <a
                        href={link.href}
                        className="text-vault-text-secondary hover:text-vault-text text-sm transition-colors"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <span className="text-vault-text-secondary text-sm cursor-default">
                        {link.label}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 pt-6 flex flex-col md:flex-row items-center justify-between gap-4 border-t border-vault-border/20">
          <div className="flex items-center gap-3 text-center md:text-left">
            <Image
              src="/logo.png"
              alt="USBVault"
              width={1536}
              height={1024}
              className="w-10 h-auto"
            />
            <div>
              <span className="text-vault-text font-semibold text-sm">
                Quantum_Shield
              </span>
              <span className="text-vault-text-muted text-xs ml-2">
                Enterprise-grade security for everyone
              </span>
            </div>
          </div>

          <p className="text-vault-text-muted text-xs">
            Built with quantum-resistant cryptography
          </p>

          <p className="text-vault-text-muted text-xs">
            &copy; 2024-2026 USBVault. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
