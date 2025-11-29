{
  description = "Synapse - MCP server for semantic search over your knowledge vault";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs =
    {
      self,
      nixpkgs,
    }:
    let
      supportedSystems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forAllSystems = nixpkgs.lib.genAttrs supportedSystems;
    in
    {
      packages = forAllSystems (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          src = builtins.path {
            path = ./.;
            name = "synapse-src";
          };
        in
        {
          default = pkgs.writeShellApplication {
            name = "synapse";
            runtimeInputs = [ pkgs.bun ];
            text = ''
              SYNAPSE_SRC="${src}"
              SYNAPSE_CACHE="''${XDG_CACHE_HOME:-$HOME/.cache}/synapse"

              # Set up runtime directory with deps
              if [ ! -d "$SYNAPSE_CACHE/node_modules" ] || [ "$SYNAPSE_SRC/bun.lock" -nt "$SYNAPSE_CACHE/.stamp" ]; then
                echo "[Synapse] Installing dependencies..." >&2
                mkdir -p "$SYNAPSE_CACHE"
                cp "$SYNAPSE_SRC/package.json" "$SYNAPSE_SRC/bun.lock" "$SYNAPSE_CACHE/"
                (cd "$SYNAPSE_CACHE" && bun install --frozen-lockfile)
                touch "$SYNAPSE_CACHE/.stamp"
              fi

              # Run with node_modules from cache
              cd "$SYNAPSE_CACHE"
              exec bun run "$SYNAPSE_SRC/src/index.ts" "$@"
            '';
          };
        }
      );

      devShells = forAllSystems (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in
        {
          default = pkgs.mkShell {
            buildInputs = [
              pkgs.bun
              pkgs.lefthook
              pkgs.biome
              pkgs.gitleaks
              pkgs.nixfmt-rfc-style
              pkgs.nodePackages.prettier
            ];
          };
        }
      );
    };
}
