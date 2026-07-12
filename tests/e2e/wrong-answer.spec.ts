import { expect, test } from "@playwright/test";

test("offers a hint after the first wrong deduction", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "体验示例案件" }).click();
  await page.getByRole("button", { name: "进入现场" }).click({ timeout: 5000 });

  for (const clue of ["查看停摆的时钟", "查看仍温热的马克杯", "查看翻开的笔记本"]) {
    await page.getByRole("button", { name: clue }).click();
    await page.getByRole("button", { name: "收起线索" }).click();
  }

  await page.getByRole("button", { name: "开始推理" }).click();
  await page.getByRole("radio", { name: "深夜车站" }).check();
  await page.getByRole("button", { name: "提交推理" }).click();

  await expect(page.getByText(/把时间、门禁和“最高处”放在一起想/)).toBeVisible();
  await expect(page.getByText("案件已解开")).not.toBeVisible();
});
