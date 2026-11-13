# Specifies that the instance-render QA check reads render exemptions from the
# declaration rather than matching an instance name.
Feature: The render check reads the exemption from the declaration

  @test:schemas/render-exemption.test.ts::isExemptFrom_is_what_the_QA_axis_calls::the_axis_reads_the_DECLARATION,_not_an_instance_name
  Scenario: The render checker calls the declaration's exemption problems and never names bootstrap
    Given the source of cat-harness-tools/scripts/check-instance-render.ts
    When it is read as text
    Then it contains "renderExemptionProblems"
    And it does not compare anything to "bootstrap"
    # Gap: the describe names isExemptFrom as what the axis calls, but the test only searches the source text for renderExemptionProblems; isExemptFrom is not checked and nothing is run.
