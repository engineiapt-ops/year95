#!/usr/bin/env ruby
# Structural guard for the manually approved production deployment workflow.
require "yaml"

workflow_path = ".github/workflows/deploy.yml"
source = File.read(workflow_path)
workflow = YAML.safe_load_file(workflow_path, permitted_classes: [], aliases: true)
triggers = workflow["on"] || workflow[true]

abort "Expected workflow_dispatch to be the only trigger." unless
  triggers.is_a?(Hash) && triggers.keys == ["workflow_dispatch"]

jobs = workflow.fetch("jobs")
abort "Expected validate job." unless jobs.key?("validate")
abort "Expected publish job." unless jobs.key?("publish")

validate = jobs.fetch("validate")
publish = jobs.fetch("publish")

needs = publish["needs"]
needs = [needs] unless needs.is_a?(Array)
abort "publish must depend on validate." unless needs.include?("validate")

publish_condition = publish["if"].to_s
abort "publish must fail closed unless validate succeeded." unless
  publish_condition.include?("needs.validate.result == 'success'")

environment = publish["environment"]
abort "publish must target the production environment." unless
  environment.is_a?(Hash) && environment["name"] == "production"

validate_steps = validate.fetch("steps")
publish_steps = publish.fetch("steps")
abort "validate must mask secrets before other steps." unless
  validate_steps.first&.fetch("name", nil) == "Mask production secrets before any other step"
abort "publish must mask secrets before other steps." unless
  publish_steps.first&.fetch("name", nil) == "Mask production secrets before any other step"
abort "publish must include the Render deployment step." unless
  publish_steps.any? { |step| step["name"] == "Trigger Render deploy for the confirmed production commit" }
abort "publish must include the Cloudflare Pages deployment step." unless
  publish_steps.any? { |step| step["name"] == "Deploy production web bundle to Cloudflare Pages" }
abort "publish must include the production smoke test." unless
  publish_steps.any? { |step| step["name"] == "Run production readiness and browser login smoke test" }

abort "Staging-specific configuration must not remain in the production workflow." if
  source.match?(/STAGING_[A-Z0-9_]+/)
abort "Automatic workflow triggers are forbidden." if
  source.match?(/^\s*(workflow_run|push|pull_request):/)

abort "Forbidden migration/database secret reference found." if
  source.match?(/STAGING_DATABASE_URL_MIGRATE|secrets\.[A-Za-z0-9_]*DATABASE_URL[A-Za-z0-9_]*/)

abort "Workflow must not run database migrations." if
  source.match?(/pnpm\s+check:migrations|supabase\s+db\s+push|db:migrate|migrate\s+up/i)

puts "Production deploy structural checks passed."
