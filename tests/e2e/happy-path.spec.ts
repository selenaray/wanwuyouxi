import { expect, test } from "@playwright/test";

test("plays the sample mystery through evidence and suspect cards", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "万物有戏" })).toBeVisible();

  await page.getByRole("button", { name: "体验示例案件" }).click();
  await expect(page.getByText("正在重建案发现场")).toBeVisible();
  await expect(page.getByRole("heading", { name: "午夜桌面的证词" })).toBeVisible({ timeout: 5000 });

  await page.getByRole("button", { name: "进入现场" }).click();
  for (const evidence of ["查看台灯物证", "查看书本物证", "查看杯子物证"]) {
    await page.getByRole("button", { name: evidence }).click();
    await page.getByRole("button", { name: "收起物证" }).click();
  }

  await page.getByRole("button", { name: "查看乔野角色卡" }).click();
  await expect(page.getByText("杯子从始至终都在原位。")).toBeVisible();
});

test("keeps a top-edge hotspot clickable beneath the display header", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "体验示例案件" }).click();
  await expect(page.getByRole("heading", { name: "午夜桌面的证词" })).toBeVisible({ timeout: 5000 });
  await page.getByRole("button", { name: "进入现场" }).click();

  const topEdgeHotspot = page.getByRole("button", { name: "查看书本物证" });
  await topEdgeHotspot.evaluate((element) => { element.style.top = "13%"; });
  await topEdgeHotspot.click();

  await expect(page.getByRole("heading", { name: "书本" })).toBeVisible();
});
