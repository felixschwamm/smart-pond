variable "project_name" {
  description = "The name of the project"
  type        = string
  default     = "smart-pond-v3"
}

variable "api_domain_cert_arn" {
  description = "The ARN of the certificate for the API domain"
  type        = string
  default     = "arn:aws:acm:eu-central-1:062276541464:certificate/0659492e-e5ca-42d0-aa2d-ad595af39d1c"
}

variable "api_domain" {
  description = "The domain name for the API"
  type        = string
  default     = "api.smartpond.schbigger.de"
  
}

variable "api_trusted_origins" {
  description = "The list of trusted origins for the API"
  type        = list(string)
  default     = ["*"]
}