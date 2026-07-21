import { expect, test } from "@playwright/test";

test("unlocks three suspect cards from the three evidence items", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "体验示例案件" }).click();
  await expect(page.getByRole("heading", { name: "午夜桌面的证词" })).toBeVisible({ timeout: 5000 });
  await page.getByRole("button", { name: "进入现场" }).click();

  await expect(page.getByText("已解锁 0/3 嫌疑人")).toBeVisible();
  for (const evidence of ["查看台灯物证", "查看书本物证", "查看杯子物证"]) {
    await page.getByRole("button", { name: evidence }).click();
    await page.getByRole("button", { name: "收起物证" }).click();
  }

  const qiaoCard = page.getByRole("button", { name: "查看乔野角色卡" });
  await expect(qiaoCard).toBeEnabled();
  await qiaoCard.click();
  await expect(page.getByText("杯子从始至终都在原位。")).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
});
