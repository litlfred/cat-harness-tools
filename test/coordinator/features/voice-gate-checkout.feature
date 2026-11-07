# Specifies readActiveVoices (schemas/content/voices.ts) for the cat-harness
# instance and the checkout root. The per-voice registration tests have
# computed titles and are not tagged here.
Feature: The instance activates its voice by config, and the checkout root has no voices to answer

  @test:test/coordinator/voice-gate-checkout.test.ts::readActiveVoices::this_instance_activates_the_base_skill-authoring_voice
  Scenario: cat-harness activates the agent-skill-authoring voice
    Given the cat-harness instance
    When its active voices are read
    Then they are exactly agent-skill-authoring

  @test:test/coordinator/voice-gate-checkout.test.ts::readActiveVoices::the_checkout_root_declares_no_instance,_so_it_has_no_voices_to_answer
  Scenario: The checkout root answers no voices at all
    Given the checkout root
    When its active voices are read
    Then the answer is undefined, not an empty list
