# The onboarding path: the repo scan leaves what it cannot classify in a third
# bucket, and the Pages address is derived from the git remote or not at all.
# Each Scenario names the test that executes it.
Feature: Onboarding scans a repository honestly and derives its Pages address from its remote

  @test:scripts/tests/conduct/getting-started.test.ts::scan-repo-content_—_the_third_bucket::a_directory_convention_beats_the_extension
  Scenario: A directory convention beats the file extension
    Given the files "references/smith-2019.md" and "docs/chapter-1.pdf"
    When each is classified
    Then the .md under references/ is in the "library" bucket
    And the .pdf under docs/ is in the "content" bucket

  @test:scripts/tests/conduct/getting-started.test.ts::scan-repo-content_—_the_third_bucket::source_material_and_prose_land_where_they_should_on_extension_alone
  Scenario: With no directory convention, the extension decides
    Given the files "smith-2019.pdf" and "outline.md" at the top level
    When each is classified
    Then the .pdf is in the "library" bucket
    And the .md is in the "content" bucket

  @test:scripts/tests/conduct/getting-started.test.ts::scan-repo-content_—_the_third_bucket::what_it_cannot_place_is_reported,_not_filed_on_a_guess
  Scenario: A file it cannot place is left unclassified, with the reason
    Given the file "src/index.ts"
    When it is classified
    Then its bucket is "unclassified"
    And its reason mentions ".ts"

  @test:scripts/tests/conduct/getting-started.test.ts::scan-repo-content_—_the_third_bucket::every_classification_carries_a_reason_an_author_can_argue_with
  Scenario: Every classification carries a non-empty reason
    Given the files "a.pdf", "notes/b.md", "c.xyz" and "Makefile"
    When each is classified
    Then each classification has a non-empty reason

  @test:scripts/tests/conduct/getting-started.test.ts::scan-repo-content_—_the_third_bucket::scanning_this_repo_writes_nothing_and_leaves_source_code_unclassified
  Scenario: Scanning the harness checkout leaves its source code unclassified
    # Gap: the title says the scan "writes nothing"; the body never checks the file system is unchanged
    Given the harness checkout
    When it is scanned
    Then the scan's source is "git" and it lists at least one entry
    And at least one file is unclassified
    And every per-directory group shows at most 5 examples

  @test:scripts/tests/conduct/getting-started.test.ts::pages-bootstrap_—_deriving_the_address::parses_every_shape_a_GitHub_remote_comes_in
  Scenario: Every shape of GitHub remote parses to its owner and repo
    Given the scp-style, https with and without ".git", and ssh:// forms of the remote for litlfred/folio-assistant
    When each is parsed
    Then each yields owner "litlfred" and repo "folio-assistant"

  @test:scripts/tests/conduct/getting-started.test.ts::pages-bootstrap_—_deriving_the_address::an_unparseable_remote_yields_no_URL_rather_than_a_guessed_one
  Scenario: An unparseable remote yields no URL rather than a guess
    Given the remote "not a url" and a directory that does not exist
    When the remote is parsed and a Pages URL is derived for the directory
    Then the parse yields nothing
    And the derived URL is undefined

  @test:scripts/tests/conduct/getting-started.test.ts::pages-bootstrap_—_deriving_the_address::a_repository's_address_is_derived_from_its_remote
  Scenario: A repository's Pages address is derived from its git remote
    Given a throwaway git repository whose origin is "https://github.com/example/demo.git"
    When its Pages URL is derived
    Then the URL is "https://example.github.io/demo/"
    And its source is recorded as "git remote"
