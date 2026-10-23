import { demoScreens } from "./demo.screens";
import { demoUrl, test } from "./fixtures";
import { checkScreens } from "./screens";

test.use({ baseURL: demoUrl });

checkScreens(demoScreens);
