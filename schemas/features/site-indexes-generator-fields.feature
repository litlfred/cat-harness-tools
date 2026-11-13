# Specifies fields of the site indexes (schemas/ui/site-indexes.ts): the
# translation-status index, the schema-graph index's source rows, and library
# index entries' catalogue, upstream and view fields.
Feature: The site indexes carry the fields their generators write

  @test:schemas/site-indexes-generator-fields.test.ts::folio-translation-status/v1_carries_the_drawer's_fields::per-catalogue_rows_and_officiality_parse
  Scenario: A translation status with per-catalogue rows and officiality parses
    Given a translation-status index whose French locale lists one catalogue file and an "unofficial" officiality
    When it is parsed
    Then there are no issues

  @test:schemas/site-indexes-generator-fields.test.ts::folio-translation-status/v1_carries_the_drawer's_fields::the_status_page_the_drawer_links_parses
  Scenario: A translation status naming its page parses
    Given a translation-status index with a page path
    When it is parsed
    Then there are no issues

  @test:schemas/site-indexes-generator-fields.test.ts::folio-translation-status/v1_carries_the_drawer's_fields::an_index_written_before_the_fields_existed_still_parses
  Scenario: A translation status without the newer fields parses
    Given a translation-status index with no files, officiality or page
    When it is parsed
    Then it parses

  @test:schemas/site-indexes-generator-fields.test.ts::folio-translation-status/v1_carries_the_drawer's_fields::an_officiality_state_outside_the_four_is_refused
  Scenario: An unknown officiality state is refused
    Given a translation-status index whose officiality state is "signed"
    When it is parsed
    Then it is refused

  @test:schemas/site-indexes-generator-fields.test.ts::folio-schema-graph/v1_carries_the_source-descriptor_rows::a_row_with_every_optional_field_parses
  Scenario: A source-descriptor row with every optional field parses
    Given a schema-graph index with a source row giving title, identifiers, enumeration and character
    When it is parsed
    Then there are no issues

  @test:schemas/site-indexes-generator-fields.test.ts::folio-schema-graph/v1_carries_the_source-descriptor_rows::an_unknown_key_on_a_row_is_still_refused
  Scenario: An unknown key on a source row is refused
    Given a schema-graph index with a source row carrying an extra key
    When it is parsed
    Then it is refused

  @test:schemas/site-indexes-generator-fields.test.ts::folio-library-index/v1_entries_carry_catalogue_and_upstream_links_(#1752,_#1765)::an_entry_with_catalogue_and_upstream_metadata_parses
  Scenario: A library entry with catalogue and upstream links parses
    Given a library index entry with catalogue record, handle, xml and node, and one upstream link
    When it is parsed
    Then there are no issues

  @test:schemas/site-indexes-generator-fields.test.ts::folio-library-index/v1_entries_carry_catalogue_and_upstream_links_(#1752,_#1765)::a_catalogued_entry_whose_id_has_capitals_has_a_view_that_parses
  Scenario: A view path with capitals parses
    Given a library entry whose view is "/library/who-iris/WHO-2019-nCoV-eng/"
    When it is parsed
    Then there are no issues

  @test:schemas/site-indexes-generator-fields.test.ts::folio-library-index/v1_entries_carry_catalogue_and_upstream_links_(#1752,_#1765)::a_view_without_its_leading_or_trailing_slash_is_refused
  Scenario: A view path missing a leading or trailing slash is refused
    Given library entries whose view lacks the leading slash, and lacks the trailing slash
    When each is parsed
    Then each is refused

  @test:schemas/site-indexes-generator-fields.test.ts::folio-library-index/v1_entries_carry_catalogue_and_upstream_links_(#1752,_#1765)::an_unknown_key_inside_catalogue_is_refused
  Scenario: An unknown key inside catalogue is refused
    Given a library entry whose catalogue carries an extra key
    When it is parsed
    Then it is refused
