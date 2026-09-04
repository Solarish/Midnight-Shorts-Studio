import { Config } from "@remotion/cli/config";
import os from "node:os";

Config.setStudioPort(47661);
Config.setDelayRenderTimeoutInMilliseconds(90000);
Config.setChromiumDisableWebSecurity(true);
Config.setChromiumIgnoreCertificateErrors(true);
Config.setChromiumOpenGlRenderer("angle");
Config.setHardwareAcceleration("if-possible");

const cpuCores = os.cpus().length || 4;
Config.setConcurrency(Math.min(10, Math.max(4, Math.floor(cpuCores * 0.5))));

