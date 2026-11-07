# Specifies ImagesSidecarSchema and narrativeFor over the images.json
# sidecars of one cat-harness and three who-iris library entries. The four
# per-entry count tests have computed titles and are not tagged here.
Feature: The real image sidecars are deduplicated, keeping every placement and its note

  @test:test/coordinator/image-placements-checkout.test.ts::the_real_corpus_is_deduplicated,_and_stays_that_way::no_two_entries_in_one_sidecar_name_the_same_file
  Scenario: No two images in one sidecar name the same file
    Given the images.json sidecars of the four library entries
    When each is parsed and its images' files are collected
    Then no file occurs twice in one sidecar

  @test:test/coordinator/image-placements-checkout.test.ts::the_real_corpus_is_deduplicated,_and_stays_that_way::the_seven_Principles_logos_are_one_image_with_six_notes
  Scenario: The seven Principles logos are one image with six notes
    Given the images.json sidecar of who-iris's 9789240010567-eng entry
    When the image with seven placements is found
    Then it exists
    And its narrative text contains "Principles for Digital Development"
    And six of its placements carry a note
    And one note contains "Build for sustainability"
