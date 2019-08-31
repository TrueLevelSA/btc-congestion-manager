import dotenv from "dotenv"

export class ConfigManager {
    private static instance: ConfigManager | null = null;

    private constructor() {
        dotenv.config();
        let path;
        switch (process.env.NODE_ENV) {
          case "test":
            path = `${__dirname}/.env.test`;
            break;
          case "production":
            path = `${__dirname}/.env.production`;
            break;
          default:
            path = `${__dirname}/.env.development`;
        }
        dotenv.config({ path: path });
    }

    public static getInstance(): ConfigManager {
        if (ConfigManager.instance === null) {
            ConfigManager.instance = new ConfigManager();
        }
        return ConfigManager.instance;
    }

    public getString(key: string , defaultValue: string = ''): string {
        if (process.env[key] === undefined) {
            return defaultValue;
        }
        return process.env[key] as string;
    }

    public getNumber(key: string , defaultValue: number = 0, radix: number = 10): number {
        if (process.env[key] === undefined) {
            return defaultValue;
        }
        return parseInt(process.env[key] as string, radix);
    }
}
