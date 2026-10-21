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

abort "validate must not require production credentials or approval." if
  validate.key?("environment") || validate.to_s.include?("secrets.")

needs = publish["needs"]
needs = [needs] unless needs.is_a?(Array)
abort "publish must depend on validate." unless needs.include?("validate")

publish_condition = publish["if"].to_s
abort "publish must fail closed unless validate succeeded." unless
  publish_condition.include?("needs.validate.result == 'success'")

environment = publish["environment"]
abort "publish must target the protected production environment." unless
  environment.is_a?(Hash) && environment["name"] == "production"

validate_steps = validate.fetch("steps")
publish_steps = publish.fetch("steps")
abort "publish must mask secrets before other steps." unless
  publish_steps.first&.fetch("name", nil) == "Mask production secrets before any other step"

step_names = publish_steps.map { |step| step["name"] }
config_index = step_names.index("Gate 4 — validate production configuration before provider calls")
render_index = step_names.index("Trigger Render deploy for the confirmed production commit")
final_gate_index = step_names.index("Final gate — recheck release SHA immediately before Render")
cloudflare_index = step_names.index("Deploy production web bundle to Cloudflare Pages")
smoke_index = step_names.index("Run production readiness and browser login smoke test")

abort "Production configuration must be checked before provider calls." unless
  config_index && render_index && config_index < render_index
abort "Release freshness must be rechecked immediately before the Render deploy." unless
  final_gate_index && render_index && final_gate_index < render_index
abort "publish must include the Cloudflare Pages deployment step." unless
  cloudflare_index && render_index && render_index < cloudflare_index
abort "publish must run production smoke tests after deployment." unless
  smoke_index && cloudflare_index && cloudflare_index < smoke_index

smoke_step = publish_steps.find { |step| step["name"] == "Run production readiness and browser login smoke test" }
abort "Production smoke test script is missing." unless
  File.file?("scripts/deployment-smoke.mjs") && smoke_step&.fetch("run", nil) == "node scripts/deployment-smoke.mjs"

abort "Staging-specific configuration must not remain in the production workflow." if
  source.match?(/STAGING_[A-Z0-9_]+/)
abort "Automatic workflow triggers are forbidden." if
  source.match?(/^\s*(workflow_run|push|pull_request):/)

abort "Forbidden migration/database secret reference found." if
  source.match?(/STAGING_DATABASE_URL_MIGRATE|secrets\.[A-Za-z0-9_]*DATABASE_URL[A-Za-z0-9_]*/)

abort "Workflow must not run database migrations." if
  source.match?(/pnpm\s+check:migrations|supabase\s+db\s+push|db:migrate|migrate\s+up/i)

puts "Production deploy structural checks passed."
