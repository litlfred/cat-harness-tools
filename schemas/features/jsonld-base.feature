# Specifies the content JSON-LD context (schemas/kg/jsonld.ts): content @ids
# resolve against FOLIO_BASE even under a strict JSON-LD 1.1 processor.
Feature: Content @ids resolve against the folio base, not the document's URL

  @test:schemas/jsonld-base.test.ts::content_@id_under_a_strict_JSON-LD_1.1_processor::the_two-part_context_resolves_against_FOLIO_BASE
  Scenario: The two-part context resolves a relative @id against FOLIO_BASE
    Given a content document with the two-part context and a relative @id, at a foreign URL
    When it is expanded by a strict processor whose published context carries no @base
    Then its @id is FOLIO_BASE followed by the relative path

  @test:schemas/jsonld-base.test.ts::content_@id_under_a_strict_JSON-LD_1.1_processor::control:_the_bare_URL_resolves_against_the_document's_own_URL_—_the_defect
  Scenario: The bare context URL resolves against the document's own URL
    Given the same document using only the bare context URL
    When it is expanded by the strict processor
    Then its @id resolves under the foreign document's directory

  @test:schemas/jsonld-base.test.ts::ContentContextSchema::accepts_the_two-part_form_and_the_bare_URL_older_records_carry
  Scenario: The content context schema accepts the two-part form and the bare URL
    Given the two-part content document context and the bare content context URL
    When each is parsed with the content context schema
    Then both parse

  @test:schemas/jsonld-base.test.ts::ContentContextSchema::refuses_any_other_context_or_base
  Scenario: The content context schema refuses any other context or base
    Given a foreign context URL, the context URL with a foreign @base, and the context URL with FOLIO_BASE plus an extra key
    When each is parsed
    Then each is refused
