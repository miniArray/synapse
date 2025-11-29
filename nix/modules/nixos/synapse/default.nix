{ self }:
{
  config,
  lib,
  pkgs,
  ...
}:
let
  inherit (lib)
    mkEnableOption
    mkOption
    mkIf
    types
    ;
  cfg = config.services.synapse;
in
{
  options.services.synapse = {
    enable = mkEnableOption "Synapse MCP server for semantic search";

    port = mkOption {
      type = types.port;
      default = 3939;
      description = "Port for the synapse server to listen on";
    };

    host = mkOption {
      type = types.str;
      default = "127.0.0.1";
      description = "Host address for the synapse server";
    };

    vaultPath = mkOption {
      type = types.path;
      description = "Path to the knowledge vault";
    };

    envPath = mkOption {
      type = types.nullOr types.path;
      default = null;
      description = "Path to store embeddings database. Defaults to vaultPath/.synapse";
    };

    ollamaUrl = mkOption {
      type = types.str;
      default = "http://localhost:11434";
      description = "URL for the Ollama API";
    };

    ollamaModel = mkOption {
      type = types.str;
      default = "nomic-embed-text";
      description = "Ollama model to use for embeddings";
    };

    user = mkOption {
      type = types.str;
      default = "synapse";
      description = "User to run the synapse service as";
    };

    group = mkOption {
      type = types.str;
      default = "synapse";
      description = "Group to run the synapse service as";
    };

    package = mkOption {
      type = types.package;
      default = self.packages.${pkgs.system}.default;
      defaultText = lib.literalExpression "self.packages.\${pkgs.system}.default";
      description = "Synapse package to use";
    };
  };

  config = mkIf cfg.enable (
    let
      envPath = if cfg.envPath != null then cfg.envPath else "${cfg.vaultPath}/.synapse";
      isSystemUser = cfg.user == "synapse";
    in
    {
      systemd.services.synapse = {
        description = "Synapse MCP Server";
        after = [
          "network.target"
          "ollama.service"
        ];
        wants = [ "ollama.service" ];
        wantedBy = [ "multi-user.target" ];

        environment = {
          MCP_PORT = toString cfg.port;
          MCP_HOST = cfg.host;
          VAULT_PATH = toString cfg.vaultPath;
          ENV_PATH = toString envPath;
          OLLAMA_URL = cfg.ollamaUrl;
          OLLAMA_MODEL = cfg.ollamaModel;
        }
        // lib.optionalAttrs isSystemUser {
          HOME = "/var/lib/synapse";
          XDG_CACHE_HOME = "/var/lib/synapse/.cache";
        };

        serviceConfig = {
          Type = "simple";
          User = cfg.user;
          Group = cfg.group;
          ExecStart = "${cfg.package}/bin/synapse";
          Restart = "always";
          RestartSec = "10";

          # Security hardening (relaxed when running as real user)
          NoNewPrivileges = true;
          ProtectSystem = "strict";
          PrivateTmp = true;
          PrivateDevices = true;
          ProtectHostname = true;
          ProtectClock = true;
          ProtectKernelTunables = true;
          ProtectKernelModules = true;
          ProtectKernelLogs = true;
          ProtectControlGroups = true;
          RestrictAddressFamilies = [
            "AF_UNIX"
            "AF_INET"
            "AF_INET6"
          ];
          RestrictNamespaces = true;
          LockPersonality = true;
          RestrictRealtime = true;
          RestrictSUIDSGID = true;
          RemoveIPC = true;

          # File system access - only restrict when using system user
          ReadWritePaths = [ envPath ];
        }
        // lib.optionalAttrs isSystemUser {
          StateDirectory = "synapse";
          StateDirectoryMode = "0750";
          ProtectHome = "read-only";
          ReadOnlyPaths = [ cfg.vaultPath ];
        };
      };

      users.users.${cfg.user} = mkIf (cfg.user == "synapse") {
        description = "Synapse MCP server user";
        isSystemUser = true;
        group = cfg.group;
        home = "/var/lib/synapse";
      };

      users.groups.${cfg.group} = mkIf (cfg.group == "synapse") { };
    }
  );
}
