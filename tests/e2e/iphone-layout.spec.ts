import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 375, height: 667 } });

test("centers the primary label and keeps home actions inside a short iPhone viewport", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("9:41")).toHaveCount(0);

  const primary = page.getByRole("button", { name: "开始扫描现场" });
  const label = primary.getByText("开始扫描现场", { exact: true });
  const [primaryBox, labelBox, secondaryBox, privacyBox] = await Promise.all([
    primary.boundingBox(),
    label.boundingBox(),
    page.getByRole("button", { name: "体验示例案件" }).boundingBox(),
    page.getByText("照片会安全上传用于本次 AI 生成，并在 24 小时内删除").boundingBox(),
  ]);

  expect(primaryBox).not.toBeNull();
  expect(labelBox).not.toBeNull();
  expect(secondaryBox).not.toBeNull();
  expect(privacyBox).not.toBeNull();
  expect(Math.abs(
    (labelBox!.x + labelBox!.width / 2) - (primaryBox!.x + primaryBox!.width / 2),
  )).toBeLessThanOrEqual(2);
  expect(secondaryBox!.y + secondaryBox!.height).toBeLessThanOrEqual(667);
  expect(privacyBox!.y + privacyBox!.height).toBeLessThanOrEqual(667);
});
