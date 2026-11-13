# `check:tools` reports a Tool declared inline rather than in its own folder
# (bean tdir). Each Scenario names the test that executes it.
Feature: A Tool declared inline rather than in its folder is a finding

  @test:scripts/tests/tools/check-tools-inline.test.ts::inline_Tool_declarations_are_a_finding::the_barrel_is_reported,_the_folder_Tool_is_not
  Scenario: Only a barrel declaring a Tool is reported
    Given a scratch tools directory with folder-tool/folder-tool.ts calling defineTool, an index.ts calling defineTool, a lib.ts with no Tool, and an index.test.ts calling defineTool
    When inline Tool findings are collected for it
    Then the only finding is tools/index.ts of instance "scratch"

  @test:scripts/tests/tools/check-tools-inline.test.ts::inline_Tool_declarations_are_a_finding::an_absent_tools_directory_is_no_finding_and_no_crash
  Scenario: An absent tools directory yields no finding and no error
    Given a tools directory path that does not exist
    When inline Tool findings are collected for it
    Then there are none

  @test:scripts/tests/tools/check-tools-inline.test.ts::inline_Tool_declarations_are_a_finding::every_declared_tools_directory_in_this_checkout_is_asked
  Scenario: The checkout declares at least one tools directory
    # Gap: the title says every declared directory "is asked"; the body checks only that at least one is declared, not that the finder visits each
    When the declared tools directories are listed
    Then there is at least one
