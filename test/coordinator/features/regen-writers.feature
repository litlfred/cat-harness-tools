# Specifies that each writer regen pairs for translate-bpmn:bootstrap:check,
# translate-bpmn:check, bat:sync:check and render:bpmn:check repairs a staled
# artefact. Its only test is generated per check with a computed title, so no
# Scenario can tag it; none is written here.
Feature: Each writer regen runs turns a staled artefact's check green
