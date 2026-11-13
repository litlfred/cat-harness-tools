# The voices reader and its viewer (bean bu2q). Each check is about what the
# page claims: absent directories are rows, every rule cites a source and a
# passage, the page's severities agree with the criteria derivation, vendor
# overrides load only from declared sub-graphs, and resolved citations carry
# their links (bean qgjh). Each Scenario names the test that executes it.
Feature: The voices reader and viewer say only what is true of the voices

  @test:scripts/tests/content/voices-viz.test.ts::a_declared_directory_that_is_not_there_is_a_ROW,_not_a_silence::a_declared-but-absent_directory_IS_reported,_on_a_fixture_that_cannot_be_closed
  Scenario: A declared voices directory that is absent is reported as a row
    Given a fixture instance declaring a "voices" directory at skills/voices/ that does not exist
    When the voices graph is read
    Then it is not null
    And exactly one directory is reported not present, with no voices and a path containing "skills/voices"

  @test:scripts/tests/content/voices-viz.test.ts::a_declared_directory_that_is_not_there_is_a_ROW,_not_a_silence::...and_the_corpus's_directories_are_all_ACCOUNTED_FOR,_present_or_not
  Scenario: Every declared voices directory of the corpus appears in the graph
    Given every voices directory declared by the instances of the repository
    When the harness's voices graph is read
    Then it has as many directories as are declared
    And each has a boolean "present", and each absent one has no voices

  @test:scripts/tests/content/voices-viz.test.ts::a_declared_directory_that_is_not_there_is_a_ROW,_not_a_silence::an_absent_directory_still_reports_its_declared_path
  Scenario: An absent directory in the corpus reports its path and instance
    # Gap: the corpus may hold no absent directory, so the loop may check nothing
    Given the harness's voices graph
    When a directory is not present
    Then its path and instance are non-empty

  @test:scripts/tests/content/voices-viz.test.ts::the_citations_—_the_reason_the_page_exists::every_rule_cites_something,_and_the_reader_says_WHICH_KIND
  Scenario: Every rule cites a library entry or a KG node
    Given the rules of every voice in the harness's voices graph
    Then there is at least one rule
    And each rule's citation kind is "library" or "kg-node" and names what it cites

  @test:scripts/tests/content/voices-viz.test.ts::the_citations_—_the_reason_the_page_exists::every_rule_carries_the_passage_it_was_read_from
  Scenario: Every rule carries a non-empty quote
    Given the rules of every voice in the harness's voices graph
    Then each rule's quote is non-empty after trimming

  @test:scripts/tests/content/voices-viz.test.ts::the_citations_—_the_reason_the_page_exists::the_totals_add_up_to_the_rules,_rather_than_being_counted_twice
  Scenario: The graph's totals add up to its rules and voices
    Given the harness's voices graph
    Then its rule total equals the number of rules
    And its library and KG-node citation totals sum to the number of rules
    And its voice total equals the number of voices

  @test:scripts/tests/content/voices-viz.test.ts::the_page_agrees_with_the_QA_sidecars_about_severity::`overlaySeverity`_and_`criterion`_match_what_the_criteria_derivation_produces
  Scenario: The graph's severity and criterion agree with the criteria derivation
    # Gap: the describe says "agrees with the QA sidecars"; the body compares the graph with the criteria derivation functions, not with any sidecar
    Given the harness's voices graph and its shipped voices
    Then every graph voice is a shipped voice
    And its overlay severity is the one the derivation gives
    And its criterion is the composed overlay criterion id

  @test:scripts/tests/content/voices-viz.test.ts::the_viewer_page::it_carries_no_stray_backtick_—_the_failure_mode_this_generator_family_has
  Scenario: The viewer page has no backtick
    When the viewer page is generated
    Then it contains no backtick

  @test:scripts/tests/content/voices-viz.test.ts::the_viewer_page::it_is_THEMED,_so_it_carries_the_site's_top_band_(2026-10-07)
  Scenario: The viewer page is a themed page under the site layout
    When the viewer page is generated
    Then it starts with front matter using "layout: default"
    And it has no doctype, html, head, body, main, header or footer element
    And it has the "vo-title" heading and no selector outside .vo-page
    And a page scoped to "who-iris" among smart-base and who-iris links smart-base and marks who-iris current

  @test:scripts/tests/content/voices-viz.test.ts::the_viewer_page::it_names_its_own_scope,_which_is_what_makes_pruning_safe
  Scenario: The viewer page declares its scope
    When the viewer page is generated without a scope
    Then it declares an empty SCOPE
    And a page generated for "who-iris" declares SCOPE "who-iris"

  @test:scripts/tests/content/voices-viz.test.ts::the_viewer_page::it_fetches_the_projection_at_the_href_it_was_given
  Scenario: The viewer page fetches the projection at the given href
    When the viewer page is generated for "../../assets/voices/index.json"
    Then it fetches "../../assets/voices/index.json"

  @test:scripts/tests/content/voices-viz.test.ts::the_viewer_page::it_escapes_interpolated_text
  Scenario: The viewer page carries an escaping function
    # Gap: the body checks only that an escape function replacing "<" is present, not that every field is passed through it
    When the viewer page is generated
    Then it contains a function replacing "<" with "&lt;"

  @test:scripts/tests/content/voices-viz.test.ts::the_viewer_page::it_renders_the_no-citation_state_as_a_finding_rather_than_a_blank
  Scenario: The viewer page has text for a rule with no citation
    When the viewer page is generated
    Then it contains "This rule cites nothing"

  @test:scripts/tests/content/voices-viz.test.ts::the_viewer_page::it_is_dark_by_default,_and_the_site's_`light`_switch_beats_it
  Scenario: The viewer page is dark by default and follows the site's light switch
    When the viewer page is generated
    Then .vo-page sets color-scheme dark
    And a rule for :root[data-fa-scheme="light"] .vo-page is present

  @test:scripts/tests/content/voices-viz.test.ts::vendor_overrides_live_in_DECLARED_sub-graphs_of_voices::a_voice_under_`vendors/`_is_LOADED,_not_silently_skipped
  Scenario: A declared vendor override is loaded
    Given a fixture with voice "base-voice" and a declared vendor voice "base-voice-acme" under vendors/
    When the voices are loaded
    Then the voice ids are "base-voice" and "base-voice-acme"

  @test:scripts/tests/content/voices-viz.test.ts::vendor_overrides_live_in_DECLARED_sub-graphs_of_voices::`vendors`_itself_is_never_loaded_AS_a_voice
  Scenario: The vendors directory is not loaded as a voice
    Given the vendor fixture
    When the voices are loaded
    Then no voice has id "vendors"

  @test:scripts/tests/content/voices-viz.test.ts::vendor_overrides_live_in_DECLARED_sub-graphs_of_voices::the_FILE_carries_the_relation,_not_the_path
  Scenario: A vendor voice's base comes from its file
    Given the vendor fixture
    When the voices are loaded
    Then "base-voice-acme" extends "base-voice"

  @test:scripts/tests/content/voices-viz.test.ts::vendor_overrides_live_in_DECLARED_sub-graphs_of_voices::an_UNDECLARED_directory_holding_voices_is_refused,_loudly
  Scenario: A voice in an undeclared directory is refused
    Given the vendor fixture plus a voice at skills/voices/notes/draft/ that no declaration names
    When the voices are loaded
    Then loading throws an error saying it is "not declared" in voices.json

  @test:scripts/tests/content/voices-viz.test.ts::vendor_overrides_live_in_DECLARED_sub-graphs_of_voices::a_vendor_missing_from_vendors.json_is_refused,_not_skipped
  Scenario: A vendor voice missing from vendors.json is refused
    Given the vendor fixture plus a vendor voice "base-voice-other" not listed in vendors.json
    When the voices are loaded
    Then loading throws an error naming vendors.json

  @test:scripts/tests/content/voices-viz.test.ts::vendor_overrides_live_in_DECLARED_sub-graphs_of_voices::the_declaration_files_are_never_loaded_AS_voices
  Scenario: The declaration files are not loaded as voices
    Given the vendor fixture
    When the voices are loaded
    Then no voice has id "voices" or "vendors"

  @test:scripts/tests/content/voices-viz.test.ts::citations_carry_their_links_(qgjh)::a_library_citation_carries_the_library_resolver's_links
  Scenario: A library citation carries the library resolver's links
    Given a projection of rules citing "lib-item#s1", "skills/a.md" and "gone.md", with resolvers for "lib-item" and "skills/a.md"
    Then the library rule's links are the viewer link "v/#x%2Flib-item"

  @test:scripts/tests/content/voices-viz.test.ts::citations_carry_their_links_(qgjh)::a_KG-node_citation_carries_its_file_link
  Scenario: A KG-node citation carries its file link
    Given the same projection
    Then the "skills/a.md" rule's links are the source "https://host/skills/a.md"

  @test:scripts/tests/content/voices-viz.test.ts::citations_carry_their_links_(qgjh)::a_citation_nothing_resolves_carries_no_links
  Scenario: A citation nothing resolves carries no links
    Given the same projection
    Then the "gone.md" rule has no links
