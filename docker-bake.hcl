variable "TAG" {
  default = "dev"
}

# public URL the site is served from; absolute link-preview tags need it
variable "SITE_URL" {
  default = ""
}

group "default" {
  targets = ["web"]
}

target "web" {
  context = "."
  args = { SITE_URL = SITE_URL }
  tags = [
    "ghcr.io/aaliboyev/cosmos:latest",
    "ghcr.io/aaliboyev/cosmos:${TAG}",
  ]
  labels = {
    "org.opencontainers.image.source" = "https://github.com/aaliboyev/cosmos"
  }
  platforms = ["linux/amd64"]
}
