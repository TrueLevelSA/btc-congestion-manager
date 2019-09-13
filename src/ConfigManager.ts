import dotenv from "dotenv"

export class ConfigManager {
    private static instance: ConfigManager | null = null;

    private constructor() {
        dotenv.config();
        let path;
        switch (process.env.NODE_ENV) {
          case "test":
            path = `.env.test`;
            break;
          case "production":
            path = `.env.production`;
            break;
          default:
            path = `.env.development`;
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

    public getInteger(key: string , defaultValue: number = 0, radix: number = 10): number {
        if (process.env[key] === undefined) {
            return defaultValue;
        }
        return parseInt(process.env[key] as string, radix);
    }

    public getFloat(key: string , defaultValue: number = .0): number {
        if (process.env[key] === undefined) {
            return defaultValue;
        }
        return parseFloat(process.env[key] as string);
    }
}
