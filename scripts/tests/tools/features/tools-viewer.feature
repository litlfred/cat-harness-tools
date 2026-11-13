# The tools graph has a page of its own, separate from skills (owner,
# 2026-09-21: "keep tools and skills separate!"). The page reports the
# Tool-to-skill join in both directions, is plain markdown under the site
# theme, is written where the declaration says, links what resolves (bean
# qgjh), carries the wireframe fixes (bean qbfm), and links each Tool's QA
# verdict (bean tdir). Each Scenario names the test that executes it.
Feature: The Tools page reports the Tool-to-skill join and links what resolves

  @test:scripts/tests/tools/tools-viewer.test.ts::the_page_reports_the_join_in_both_directions::names_the_unresolved_ones_when_there_are_any
  Scenario: A Tool satisfying an unknown skill is named on the page
    Given the harness Tool rows plus a planted Tool "planted" satisfying "no-such-skill"
    When the page is rendered
    Then it names "no-such-skill" and "`planted`"
    And it does not claim that all satisfies resolve

  @test:scripts/tests/tools/tools-viewer.test.ts::the_page_reports_the_join_in_both_directions::names_a_tool_that_satisfies_nothing,_as_a_separate_finding
  Scenario: A Tool satisfying nothing is named as a separate finding
    Given the harness Tool rows plus a planted Tool "orphan" satisfying nothing
    When the page is rendered
    Then it says some Tools "satisfy no skill at all"
    And it names "`orphan`"

  @test:scripts/tests/tools/tools-viewer.test.ts::the_rendered_page::keeps_the_direction_of_the_relation_explicit
  Scenario: The page states the relation runs from a Tool to a skill
    When the page is rendered for the harness Tools
    Then it contains "from a tool to a skill"

  @test:scripts/tests/tools/tools-viewer.test.ts::the_rendered_page::lists_every_tool
  Scenario: The page lists every Tool
    When the page is rendered for the harness Tools
    Then every Tool id appears in code

  @test:scripts/tests/tools/tools-viewer.test.ts::the_rendered_page::carries_no_Liquid_syntax,_because_Jekyll_renders_it_as_a_page
  Scenario: The page body carries no Liquid syntax
    When the page is rendered for the harness Tools
    Then its body after front matter contains no "{%" and no "{{"

  @test:scripts/tests/tools/tools-viewer.test.ts::the_rendered_page::is_markdown,_not_HTML_wearing_front_matter
  Scenario: The page body is markdown
    When the page is rendered and its front matter and style blocks removed
    Then it has a "## " heading and a markdown table rule
    And it has no <table>, <h1> or <h2> element

  @test:scripts/tests/tools/tools-viewer.test.ts::the_rendered_page::declares_no_theme_CSS_of_its_own
  Scenario: The page's CSS declares no body or colour-scheme theme
    When the page is rendered
    Then its style block contains no "body{" and no "prefers-color-scheme"

  @test:scripts/tests/tools/tools-viewer.test.ts::the_generator_writes_where_the_declaration_says::resolves_its_page_path_from_the_declaration,_not_a_literal
  Scenario: The page path comes from the declaration, under the page locale
    When the page's relative path is resolved for the repository
    Then it is defined
    And it starts with the page locale

  @test:scripts/tests/tools/tools-viewer.test.ts::the_generator_writes_where_the_declaration_says::and_the_page_is_at_that_path
  Scenario: The written page exists at the declared path or its pre-locale address
    # Skipped when neither file exists and the site is not built (the page is written at publish)
    Given the declared page path and the same path without the locale
    Then one of them exists under the base docs directory

  @test:scripts/tests/tools/tools-viewer.test.ts::satisfies_links_what_resolves_(qgjh)::links_a_skill_whose_page_exists,_relative_to_the_page_it_sits_on
  Scenario: A satisfied skill with a published page is a relative link
    Given the first Tool with a satisfied skill, and that skill having a page
    When the page is rendered at its declared path
    Then the Tool's satisfies cell links the skill to reference/skill-instructions/<skill>.html, one "../" per directory of the page path

  @test:scripts/tests/tools/tools-viewer.test.ts::satisfies_links_what_resolves_(qgjh)::leaves_a_skill_with_no_page_as_code
  Scenario: A satisfied skill with no page stays code
    Given the same Tool and skill, with no skill page
    When the page is rendered
    Then the satisfies cell shows the skill in code and not as a link

  @test:scripts/tests/tools/tools-viewer.test.ts::wireframe_fixes_(qbfm)::renders_stat_boxes_as_links_into_page_sections
  Scenario: The stat boxes link to page sections
    When the page is rendered for the harness Tools
    Then it has stat links to "#every-tool", "#does-every-satisfies-name-a-skill-that-exists" and "#how-they-are-invoked-and-installed"

  @test:scripts/tests/tools/tools-viewer.test.ts::wireframe_fixes_(qbfm)::renders_tool_ids_as_in-page_anchors_and_links
  Scenario: Every Tool id is an in-page anchor and a link to it
    When the page is rendered for the harness Tools
    Then each Tool id has an anchor followed by a link to "#<id>"

  @test:scripts/tests/tools/tools-viewer.test.ts::wireframe_fixes_(qbfm)::provides_mobile_scroll_cue_for_the_table_wrapper
  Scenario: The table wrapper has a mobile scroll cue
    When the page is rendered for the harness Tools
    Then it contains ".table-wrapper", "mask-image" and "animation-timeline"

  @test:scripts/tests/tools/tools-viewer.test.ts::a_Tool's_page_links_its_QA_verdict_(tdir)::links_every_Tool_row_to_its_qa-reports_verdict,_never_blob/main
  Scenario: Every Tool row links its QA verdict on qa-reports
    When the page is rendered for the harness Tools
    Then the table header ends with a "qa" column
    And every Tool's QA link is under /blob/cat/cat-harness/qa-reports/ and never /blob/main/
    And that link appears in the Tool's qa cell

  @test:scripts/tests/tools/tools-viewer.test.ts::a_Tool's_page_links_its_QA_verdict_(tdir)::addresses_each_Tool's_kg-qa_sidecar_under_the_qa-reports_entry_key_when_known
  Scenario: With a known entry key each QA link addresses the Tool's sidecar under it
    When the Tool rows are built with a qa-reports entry key
    Then each QA link contains that key under qa-reports
    And ends with "/<id>.kg-qa.json"

  @test:scripts/tests/tools/tools-viewer.test.ts::a_Tool's_page_links_its_QA_verdict_(tdir)::renders_the_sidecar_verdict_as_the_link_label_when_present,_and_qa-reports_when_not_fetched_locally
  Scenario: The QA link's label is the verdict when known, "qa-reports" otherwise
    Given the first Tool row
    Then with verdict "pass" its qa cell links "`pass`" to its QA link
    And with no verdict its qa cell links "`qa-reports`" to its QA link
