# Agent containers align the Bun runtime to the pinned `.bun-version`
# (folio-assistant-p3zo). Each Scenario names the test that executes it.
Feature: The Bun runtime is pinned and the session-start sweep aligns to the pin

  @test:scripts/tests/conduct/session-start-bun.test.ts::bun_version_pin_and_alignment_(folio-assistant-p3zo)::.bun-version_exists_and_holds_a_bare_X.Y.Z_version
  Scenario: The pin file holds a bare X.Y.Z version
    Given the harness's .bun-version file
    Then it exists
    And its trimmed text matches X.Y.Z with no prefix

  @test:scripts/tests/conduct/session-start-bun.test.ts::bun_version_pin_and_alignment_(folio-assistant-p3zo)::install-bun.sh_exists_and_is_executable
  Scenario: The install script exists and is executable
    Given scripts/install-bun.sh
    Then it exists
    And at least one of its executable bits is set

  @test:scripts/tests/conduct/session-start-bun.test.ts::bun_version_pin_and_alignment_(folio-assistant-p3zo)::install-bun.bat_exists_beside_install-bun.sh
  Scenario: A Windows install script sits beside the shell one
    Given the scripts directory
    Then install-bun.bat exists in it

  @test:scripts/tests/conduct/session-start-bun.test.ts::bun_version_pin_and_alignment_(folio-assistant-p3zo)::install-bun.sh_syntax_is_valid_bash
  Scenario: The install script parses as bash
    When `bash -n` is run on install-bun.sh
    Then it prints nothing and succeeds

  @test:scripts/tests/conduct/session-start-bun.test.ts::bun_version_pin_and_alignment_(folio-assistant-p3zo)::session-start-coord-sweep.sh_syntax_is_valid_bash
  Scenario: The session-start sweep parses as bash
    When `bash -n` is run on session-start-coord-sweep.sh
    Then it prints nothing and succeeds

  @test:scripts/tests/conduct/session-start-bun.test.ts::bun_version_pin_and_alignment_(folio-assistant-p3zo)::install-bun.sh_reports_already_installed_when_target_version_matches_running_bun
  Scenario: Installing the version already running is a no-op that says so
    When install-bun.sh is run with the running Bun's version
    Then its output says that version "is already installed and matches target."

  @test:scripts/tests/conduct/session-start-bun.test.ts::bun_version_pin_and_alignment_(folio-assistant-p3zo)::install-bun.sh_rejects_invalid_version_format_with_exit_code_2
  Scenario: A version that is not bare X.Y.Z is refused with exit code 2
    When install-bun.sh is run with "invalid", "v1.3.14", "latest" and "1.3" in turn
    Then each run exits with status 2
    And each stderr says "not a valid bare X.Y.Z version"

  @test:scripts/tests/conduct/session-start-bun.test.ts::bun_version_pin_and_alignment_(folio-assistant-p3zo)::session-start-coord-sweep.sh_includes_Bun_alignment_section_and_check-bun-runtime_invocation
  Scenario: The sweep script carries the Bun alignment section
    Given the text of session-start-coord-sweep.sh
    Then it contains the "3-ter. Bun runtime vs the pin" section, "bun_pin_file=", "install-bun.sh" and "check-bun-runtime.ts"
    And it contains the "Bun runtime aligned (folio-assistant-p3zo)" and "Bun runtime alignment warning" messages
