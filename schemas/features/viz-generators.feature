# Specifies the schema and library viewer generators (scripts/gen-schema-viz.ts,
# scripts/gen-library-viz.ts), where a viewer is placed, and the graph readers
# they publish (scripts/schema-graph.ts, scripts/library-graph.ts).
Feature: The schema and library viewers are themed pages over a relative projection

  @test:schemas/viz-generators.test.ts::the_schema_viewer::is_a_themed_Jekyll_page,_not_a_standalone_document
  Scenario: The schema viewer is a themed Jekyll page
    Given the schema viewer generated for the instances cat-harness and smart-base
    When its text is read
    Then it begins with default-layout front matter
    And it has no doctype, html, head, body, main or header element
    And it has the sc-title heading, a script and a style

  @test:schemas/viz-generators.test.ts::the_schema_viewer::fetches_its_projection_RELATIVE_to_its_own_location,_with_no_base_URL
  Scenario: The schema viewer fetches its data relative to itself
    Given the schema viewer
    When its text is read
    Then it names the relative data path and no absolute site URL

  @test:schemas/viz-generators.test.ts::the_schema_viewer::restyles_nothing_of_the_theme's,_and_follows_the_site's_scheme_switch
  Scenario: The schema viewer styles only its own wrapper and follows the scheme switch
    Given the schema viewer
    When its selectors are read
    Then none is outside .sc-page
    And .sc-page sets a dark colour scheme, with a light-scheme override

  @test:schemas/viz-generators.test.ts::the_schema_viewer::lists_its_subject_pages,_since_the_theme's_sidebar_does_not
  Scenario: The schema viewer lists its subject pages
    Given the schema viewer
    When its text is read
    Then it links to smart-base/ and marks "All instances" as the current page

  @test:schemas/viz-generators.test.ts::the_schema_viewer::says_so_when_the_projection_cannot_be_read,_rather_than_showing_nothing
  Scenario: The schema viewer has a message for an unreadable projection
    Given the schema viewer
    When its text is read
    Then it contains "could not"

  @test:schemas/viz-generators.test.ts::the_library_viewer::is_a_themed_page_on_the_default_layout,_with_its_body_Liquid-raw
  Scenario: The library viewer is a themed page with a Liquid-raw body
    Given the library viewer shell
    When its text is read
    Then it begins with default-layout front matter, a quoted title and nav_exclude true
    And it has no doctype, html, head or body element
    And its body is wrapped in raw and endraw, with the lib-title heading

  @test:schemas/viz-generators.test.ts::the_library_viewer::fetches_its_projection_RELATIVE_to_its_own_location,_with_no_base_URL
  Scenario: The library viewer fetches its data relative to itself
    Given the library viewer shell
    When its text is read
    Then it names the relative data path and no absolute site URL

  @test:schemas/viz-generators.test.ts::the_library_viewer::its_stylesheet_styles_only_its_own_wrapper,_in_both_colour_schemes
  Scenario: The library viewer's stylesheet styles only its own wrapper in both schemes
    Given the library viewer's stylesheet without comments
    When its selectors are read
    Then there are more than 50, each scoped to .lib-page with or without the light-scheme prefix
    And none targets body, :root or a
    And .lib-page has a dark background and the light scheme a white one

  @test:schemas/viz-generators.test.ts::the_library_viewer::says_so_when_the_projection_cannot_be_read,_rather_than_showing_nothing
  Scenario: The library viewer's script has a message for an unreadable projection
    Given the library viewer's script
    When its text is read
    Then it contains "could not"

  @test:schemas/viz-generators.test.ts::viewerPlacement_—_the_URL_is_the_directory's_path,_not_a_composition::a_directory_publishes_at_its_own_repo-relative_path
  Scenario: A viewer is placed at its directory's own path
    Given the directory cat-harness/schemas
    When its viewer placement under /site is computed
    Then the page directory is /site/cat-harness/schemas

  @test:schemas/viz-generators.test.ts::viewerPlacement_—_the_URL_is_the_directory's_path,_not_a_composition::a_directory_NOT_at_owner/kind_is_addressed_by_its_path,_not_by_the_renderer
  Scenario: A directory of another layer is placed at its own path
    Given the directory who-iris/library
    When its viewer placement is computed
    Then the page directory is /site/who-iris/library and does not mention cat-harness

  @test:schemas/viz-generators.test.ts::viewerPlacement_—_the_URL_is_the_directory's_path,_not_a_composition::the_data_href_is_relative_to_the_page's_own_depth
  Scenario: The data href climbs as deep as the page is
    Given a page two levels deep and one three levels deep
    When their data hrefs are computed
    Then they climb two and three levels to assets/schemas/index.json

  @test:schemas/viz-generators.test.ts::the_readers_agree_with_what_the_generators_publish::the_schema_graph_spans_every_DECLARED_schemas_directory,_not_one
  Scenario: The schema graph spans more than one schemas directory
    Given the schema graph read from this layer
    When its roots and module instances are counted
    Then there is more than one root and more than one instance
    # Gap: the title says every declared schemas directory; the test checks only that there is more than one.

  @test:schemas/viz-generators.test.ts::the_readers_agree_with_what_the_generators_publish::a_queue's_declared_intake_is_ONE_unit,_not_one_per_file_it_carries
  Scenario: Each declared intake is a single upload unit
    Given the library graph
    When its intake uploads are read
    Then each declares at least one file and is the only upload at its path

  @test:schemas/viz-generators.test.ts::the_readers_agree_with_what_the_generators_publish::every_queue's_uningested_count_is_total_minus_ingested,_and_never_negative
  Scenario: A queue's uningested count is total minus ingested
    Given the library graph's queues
    When each is read
    Then uningested is total minus ingested and not negative

  @test:schemas/viz-generators.test.ts::the_projection_is_stable_under_edits_that_do_not_change_the_graph::no_declaration_carries_a_line_number
  Scenario: The published schema projection carries no line numbers
    Given the schema projection written at publish, the test being skipped when the site is not built
    When its declarations are read
    Then there is at least one and none has a line field

  @test:schemas/viz-generators.test.ts::the_projection_is_stable_under_edits_that_do_not_change_the_graph::the_reader_still_knows_the_line,_so_a_consumer_that_wants_one_can_have_it
  Scenario: The schema graph reader keeps each declaration's line
    Given the schema graph read from this layer
    When its declarations are read
    Then every one has a positive line number
