import pc from "picocolors";

export const log = {
  info(message: string): void {
    console.log(pc.blue("ℹ"), message);
  },
  success(message: string): void {
    console.log(pc.green("✔"), message);
  },
  warn(message: string): void {
    console.log(pc.yellow("⚠"), message);
  },
  error(message: string): void {
    console.error(pc.red("✖"), message);
  },
  plain(message: string): void {
    console.log(message);
  },
};
