#!/usr/bin/env ruby
# Structural guard for the production deployment workflow.
require "yaml"

workflow_path = ".github/workflows/deploy.yml"
workflow = YAML.safe_load_file(workflow_path, permitted_classes: [], aliases: true)
triggers = workflow["on"] || workflow[true]
abort "Expected workflow_dispatch to be the only trigger." unless triggers.is_a?(Hash) && triggers.keys == ["workflow_dispatch"]

jobs = workflow.fetch("jobs")
abort "Expected validate job." unless jobs.key?("validate")

publish = jobs["publish"]
if publish
  needs = publish["needs"]
  needs = [needs] unless needs.is_a?(Array)
  abort "publish must depend on validate." unless needs.include?("validate")
end

File.read(workflow_path).then do |source|
  abort "Forbidden migration/database secret reference found." if source.match?(/STAGING_DATABASE_URL_MIGRATE|secrets\.[A-Za-z0-9_]*DATABASE_URL[A-Za-z0-9_]*/)
end

puts "Production deploy structural checks passed."
