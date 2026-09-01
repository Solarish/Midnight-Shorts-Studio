import { Config } from "@remotion/cli/config";

Config.setStudioPort(47661);
Config.setDelayRenderTimeoutInMilliseconds(90000);
Config.setChromiumDisableWebSecurity(true);
Config.setChromiumIgnoreCertificateErrors(true);
Config.setChromiumOpenGlRenderer("angle");
Config.setHardwareAcceleration(true);
Config.setConcurrency(4);
