import { demoScreens } from "./demo.screens";
import { demoUrl, serverUrl, test } from "./fixtures";
import { checkLayouts } from "./screens";
import { serverScreens } from "./server.screens";

test.describe("demo", () => {
  test.use({ baseURL: demoUrl });
  checkLayouts(demoScreens);
});

test.describe("server", () => {
  test.use({ baseURL: serverUrl });
  checkLayouts(serverScreens);
});
