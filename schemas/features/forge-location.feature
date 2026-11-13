# Specifies forgeLocation (schemas/kg/cat-harness.ts) over a remote mount
# recorded in a mount lock: a mounted path names the mounted repository.
Feature: A path under a remote mount is located in the mounted repository

  @test:schemas/forge-location.test.ts::forgeLocation_over_a_remote_mount::a_mounted_path_names_the_mounted_repository,_relative_to_its_root
  Scenario: A path under a mount names the mounted repository
    Given a host checkout whose mount lock mounts repository o/leaf at path "leaf"
    When the forge location of "leaf/leaf.json" is computed for host https://github.com/o/host
    Then the repository is https://github.com/o/leaf and the path is "leaf.json"

  @test:schemas/forge-location.test.ts::forgeLocation_over_a_remote_mount::a_path_that_only_shares_a_prefix_stays_this_checkout's
  Scenario: A path that only shares the mount's prefix stays in this checkout
    Given the same mount lock
    When the forge location of "leafy/x.md" is computed
    Then the repository is the host's and the path is "leafy/x.md"
