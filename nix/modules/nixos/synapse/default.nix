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
      default = "/snowscape/knowledge";
      description = "Path to the knowledge vault";
    };

    envPath = mkOption {
      type = types.path;
      default = "/snowscape/knowledge/.smart-env";
      description = "Path to the smart-env embeddings directory";
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
      default = pkgs.synapse;
      description = "Synapse package to use";
    };
  };

  config = mkIf cfg.enable {
    systemd.services.synapse = {
      description = "Synapse MCP Server";
      after = [ "network.target" ];
      wantedBy = [ "multi-user.target" ];

      environment = {
        MCP_PORT = toString cfg.port;
        MCP_HOST = cfg.host;
        VAULT_PATH = cfg.vaultPath;
        ENV_PATH = cfg.envPath;
      };

      serviceConfig = {
        Type = "simple";
        User = cfg.user;
        Group = cfg.group;
        ExecStart = "${cfg.package}/bin/synapse";
        Restart = "always";
        RestartSec = "10";

        # Writable state directory for cache
        StateDirectory = "synapse";
        Environment = "HOME=/var/lib/synapse";

        # Security hardening
        NoNewPrivileges = true;
        ProtectSystem = "strict";
        ProtectHome = "read-only";
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

        # Read access to vault
        ReadOnlyPaths = [
          cfg.vaultPath
          cfg.envPath
        ];
      };
    };

    users.users.${cfg.user} = mkIf (cfg.user == "synapse") {
      description = "Synapse MCP server user";
      isSystemUser = true;
      group = cfg.group;
    };

    users.groups.${cfg.group} = mkIf (cfg.group == "synapse") { };
  };
}
