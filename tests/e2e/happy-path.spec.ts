import { expect, test } from "@playwright/test";

test("plays the sample mystery from home to truth", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "万物有戏" })).toBeVisible();

  await page.getByRole("button", { name: "体验示例案件" }).click();
  await expect(page.getByText("正在重建案发现场")).toBeVisible();
  await expect(page.getByRole("heading", { name: "凌晨零点的失踪者" })).toBeVisible({ timeout: 5000 });

  await page.getByRole("button", { name: "进入现场" }).click();
  for (const clue of ["查看停摆的时钟", "查看仍温热的马克杯", "查看翻开的笔记本"]) {
    await page.getByRole("button", { name: clue }).click();
    await page.getByRole("button", { name: "收起线索" }).click();
  }

  await page.getByRole("button", { name: "开始推理" }).click();
  await page.getByRole("radio", { name: "宿舍天台" }).check();
  await page.getByRole("button", { name: "提交推理" }).click();

  await expect(page.getByText("案件已解开")).toBeVisible();
  await expect(page.getByText(/林夏没有离开宿舍楼/)).toBeVisible();
  await page.screenshot({ path: "test-results/final-mobile.png", fullPage: true });
});

test("keeps a top-edge hotspot clickable beneath the display header", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "体验示例案件" }).click();
  await expect(page.getByRole("heading", { name: "凌晨零点的失踪者" })).toBeVisible({ timeout: 5000 });
  await page.getByRole("button", { name: "进入现场" }).click();

  const topEdgeHotspot = page.getByRole("button", { name: "查看翻开的笔记本" });
  await topEdgeHotspot.evaluate((element) => { element.style.top = "13%"; });
  await topEdgeHotspot.click();

  await expect(page.getByRole("heading", { name: "翻开的笔记本" })).toBeVisible();
});
