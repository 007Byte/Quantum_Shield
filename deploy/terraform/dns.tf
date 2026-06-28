# =============================================================================
# Quantum_Shield — DNS Configuration (Route 53)
# =============================================================================
#
# Manages DNS records for the USBVault production domain. This file assumes:
#   - A Route 53 hosted zone for "usbvault.io" already exists (managed outside
#     Terraform or in a separate root module).
#   - The Kubernetes ingress controller provisions an AWS ELB/NLB whose hostname
#     is passed in via `var.ingress_hostname`.
#   - cert-manager handles TLS via HTTP-01 challenges, so DNS records must
#     resolve to the ingress load balancer before certificates can be issued.
#
# Records created:
#   api.usbvault.io  — API server (Go backend, WebSocket sync endpoint)
#   app.usbvault.io  — Web application (React Native Web / Expo)
# =============================================================================

# ---------------------------------------------------------------------------
# Variables
# ---------------------------------------------------------------------------

variable "domain_name" {
  description = "Root domain for the USBVault platform"
  type        = string
  default     = "usbvault.io"
}

variable "ingress_hostname" {
  description = <<-EOT
    Hostname of the Kubernetes ingress load balancer (ELB/NLB).
    Obtain this after deploying the nginx-ingress controller:
      kubectl get svc -n ingress-nginx ingress-nginx-controller \
        -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'
  EOT
  type        = string
}

# ---------------------------------------------------------------------------
# Data source — existing Route 53 hosted zone
# ---------------------------------------------------------------------------

# Look up the hosted zone by domain name. This avoids hard-coding zone IDs
# and makes the config portable across AWS accounts.
data "aws_route53_zone" "primary" {
  name         = var.domain_name
  private_zone = false
}

# ---------------------------------------------------------------------------
# API subdomain — api.usbvault.io
# ---------------------------------------------------------------------------
# Points to the Kubernetes ingress controller's load balancer. All backend
# traffic (REST API, WebSocket sync, webhook receivers) routes through here.
# Using a CNAME rather than an alias because the target is an ELB/NLB hostname
# (not a CloudFront distribution or S3 bucket where alias would be preferred).

resource "aws_route53_record" "api" {
  zone_id = data.aws_route53_zone.primary.zone_id
  name    = "api.${var.domain_name}"
  type    = "CNAME"
  ttl     = 300

  records = [var.ingress_hostname]
}

# ---------------------------------------------------------------------------
# Web app subdomain — app.usbvault.io
# ---------------------------------------------------------------------------
# Points to the same ingress controller; the nginx ingress routes traffic to
# the correct backend service based on the Host header. This allows the web
# app and API to share the same load balancer while maintaining separate
# DNS entries for clarity and future flexibility (e.g., moving the web app
# behind a CDN without changing the API record).

resource "aws_route53_record" "app" {
  zone_id = data.aws_route53_zone.primary.zone_id
  name    = "app.${var.domain_name}"
  type    = "CNAME"
  ttl     = 300

  records = [var.ingress_hostname]
}

# ---------------------------------------------------------------------------
# Outputs
# ---------------------------------------------------------------------------

output "api_fqdn" {
  description = "Fully qualified domain name for the API endpoint"
  value       = aws_route53_record.api.fqdn
}

output "app_fqdn" {
  description = "Fully qualified domain name for the web application"
  value       = aws_route53_record.app.fqdn
}

output "zone_id" {
  description = "Route 53 hosted zone ID (useful for cross-module references)"
  value       = data.aws_route53_zone.primary.zone_id
}
