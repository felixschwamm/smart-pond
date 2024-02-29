terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.16"
    }
  }

  required_version = ">= 1.2.0"
}

module "api_gateway" {
  source = "terraform-aws-modules/apigateway-v2/aws"

  default_route_settings = {
    throttling_burst_limit = 100
    throttling_rate_limit  = 200
  }

  name        = "${var.project_name}-api"
  description = "API for Smart Pond"

  cors_configuration = {
    allow_origins = var.api_trusted_origins
    allow_methods = ["*"]
    allow_headers = ["*"]
  }

  domain_name                 = var.api_domain
  domain_name_certificate_arn = var.api_domain_cert_arn

  protocol_type = "HTTP"

  integrations = {
    "POST /data" = {
      lambda_arn             = aws_lambda_function.post_data_function.arn
      payload_format_version = "2.0"
      timeout_milliseconds   = 30000
    }
  }

}

provider "aws" {
  region = "eu-central-1"
  default_tags {
    tags = {
      Project = var.project_name
    }
  }
}

resource "aws_dynamodb_table" "table" {
  name         = "${var.project_name}-table"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "N"
  }

}

resource "aws_lambda_function" "post_data_function" {
  function_name    = "${var.project_name}-post-data"
  handler          = "dist/index.postData"
  runtime          = "nodejs18.x"
  filename         = "function.zip"
  source_code_hash = filebase64sha256("function.zip")
  role             = aws_iam_role.role.arn
  memory_size      = 256
  environment {
    variables = {
      TABLE_NAME = aws_dynamodb_table.table.name
    }
  }
}

resource "aws_lambda_permission" "post_data_function_permission" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.post_data_function.arn
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${module.api_gateway.apigatewayv2_api_execution_arn}/*"
}

resource "aws_iam_policy" "policy" {
  name        = "${var.project_name}-policy"
  description = "Policy for Smart Pond"
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Action = [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem"
        ],
        Resource = aws_dynamodb_table.table.arn
      }
    ]
  })
}

resource "aws_iam_role" "role" {
  name = "${var.project_name}-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Action = "sts:AssumeRole",
        Effect = "Allow",
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      },
      {
        Action = "sts:AssumeRole",
        Effect = "Allow",
        Principal = {
          Service = "scheduler.amazonaws.com"
        }
      },
      {
        Action = "sts:AssumeRole",
        Effect = "Allow",
        Principal = {
          Service = "events.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_resourcegroups_group" "group" {
  name = "${var.project_name}-group"
  resource_query {
    query = <<JSON
{
  "ResourceTypeFilters": [
    "AWS::AllSupported"
  ],
  "TagFilters": [
    {
      "Key": "Project",
      "Values": [
        "${var.project_name}"
      ]
    }
  ]
}
  JSON
  }
}

resource "aws_iam_role_policy_attachment" "attachment" {
  role       = aws_iam_role.role.name
  policy_arn = aws_iam_policy.policy.arn
}

resource "aws_iam_role_policy_attachment" "lambda_execution_role_attachment" {
  role       = aws_iam_role.role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_lambda_function" "lambda_agg_function" {
  function_name    = "${var.project_name}-agg-function"
  handler          = "dist/index.aggregateData"
  runtime          = "nodejs18.x"
  filename         = "function.zip"
  source_code_hash = filebase64sha256("function.zip")
  role             = aws_iam_role.role.arn
  memory_size      = 1024
  environment {
    variables = {
      TABLE_NAME = aws_dynamodb_table.table.name
    }
  }
}

resource "aws_lambda_permission" "agg_function_monthly_scheduler_permission" {
  statement_id  = "AllowSchedulerInvokeMonthly"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.lambda_agg_function.arn
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.agg_function_monthly_scheduler_rule.arn
}

resource "aws_lambda_permission" "agg_function_weekly_scheduler_permission" {
  statement_id  = "AllowSchedulerInvokeWeekly"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.lambda_agg_function.arn
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.agg_function_weekly_scheduler_rule.arn
}

resource "aws_lambda_permission" "agg_function_yearly_scheduler_permission" {
  statement_id  = "AllowSchedulerInvokeYearly"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.lambda_agg_function.arn
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.agg_function_yearly_scheduler_rule.arn
}

resource "aws_cloudwatch_event_rule" "agg_function_yearly_scheduler_rule" {
  name        = "${var.project_name}-yearly-agg-scheduler-rule"
  description = "Rule for yearly aggregation scheduler"
  schedule_expression = "rate(1 day)"
  role_arn = aws_iam_role.role.arn
}

resource "aws_cloudwatch_event_target" "agg_function_yearly_scheduler_target" {
  rule = aws_cloudwatch_event_rule.agg_function_yearly_scheduler_rule.name
  arn  = aws_lambda_function.lambda_agg_function.arn
  input = jsonencode({
    "period"  = "YEAR",
    "seconds" = 60 * 60 * 24
  })
}

resource "aws_cloudwatch_event_rule" "agg_function_monthly_scheduler_rule" {
  name        = "${var.project_name}-monthly-agg-scheduler-rule"
  description = "Rule for monthly aggregation scheduler"
  schedule_expression = "rate(4 hours)"
  role_arn = aws_iam_role.role.arn
}

resource "aws_cloudwatch_event_target" "agg_function_monthly_scheduler_target" {
  rule = aws_cloudwatch_event_rule.agg_function_monthly_scheduler_rule.name
  arn  = aws_lambda_function.lambda_agg_function.arn
  input = jsonencode({
    "period"  = "MONTH",
    "seconds" = 60 * 60 * 4
  })
}

resource "aws_cloudwatch_event_rule" "agg_function_weekly_scheduler_rule" {
  name        = "${var.project_name}-weekly-agg-scheduler-rule"
  description = "Rule for weekly aggregation scheduler"
  schedule_expression = "rate(1 hour)"
  role_arn = aws_iam_role.role.arn
}

resource "aws_cloudwatch_event_target" "agg_function_weekly_scheduler_target" {
  rule = aws_cloudwatch_event_rule.agg_function_weekly_scheduler_rule.name
  arn  = aws_lambda_function.lambda_agg_function.arn
  input = jsonencode({
    "period"  = "WEEK",
    "seconds" = 60 * 60
  })
}



