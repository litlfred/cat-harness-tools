# Specifies gitScan (schemas/sdlc/git-corpus.ts): a glob over the files git
# would track, falling back to a bare walk outside a work tree.
Feature: gitScan lists the files git would track that match a glob

  @test:schemas/git-scan.test.ts::gitScan::an_IGNORED_file_matching_the_pattern_is_not_in_the_corpus
  Scenario: An ignored file is not in the corpus
    Given a git repository with manifests under a/library/x and build/library/y, and build/ ignored
    When it is scanned for "**/library/*/manifest.jsonld"
    Then the source is "git"
    And the files are exactly a/library/x/manifest.jsonld

  @test:schemas/git-scan.test.ts::gitScan::an_UNTRACKED_but_not_ignored_file_IS_in_the_corpus
  Scenario: An untracked file that is not ignored is in the corpus
    Given a git repository with an uncommitted manifest under a/library/x
    When it is scanned for "**/library/*/manifest.jsonld"
    Then the files are exactly a/library/x/manifest.jsonld

  @test:schemas/git-scan.test.ts::gitScan::the_pattern_keeps_Bun_`Glob`_semantics,_not_git_pathspec_semantics
  Scenario: A single star matches one directory level only
    Given a git repository with one/x.md, one/two/x.md and one/two/three/x.md
    When it is scanned for "one/*/x.md"
    Then the files are exactly one/two/x.md

  @test:schemas/git-scan.test.ts::gitScan::outside_a_work_tree_it_falls_back_to_the_bare_scan_and_SAYS_SO
  Scenario: Outside a work tree the scan walks the directory and says so
    Given a plain directory, not a git repository, with a manifest under a/library/x
    When it is scanned for "**/library/*/manifest.jsonld"
    Then the source is "walk"
    And the files are exactly a/library/x/manifest.jsonld
