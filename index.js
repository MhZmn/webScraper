const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");
puppeteer.use(StealthPlugin());
const { executablePath } = require("puppeteer");
const random_useragent = require("random-useragent");
const url_products = "https://drnutrition.com/en-om/products";
const url_price = "https://www.tgju.org/profile/price_omr";

(async () => {
    let browser;
    let omr_price;
    // scrape price
    try {
        browser = await puppeteer.launch({
            headless: true, // Run headless since this is just a price scrape
            defaultViewport: false,
            executablePath: executablePath(),
            args: [
                "--enable-gpu",
                "--disable-notifications",
                "--no-first-run",
                "--no-default-browser-check",
                "--disable-features=site-per-process",
            ],
        });
        const page = await browser.newPage();
        await page.setUserAgent(random_useragent.getRandom());
        await page.goto(url_price, { waitUntil: "domcontentloaded" });
        await page.addStyleTag({ content: "{scroll-behavior: auto !important;}" });

        omr_price = await page.evaluate(() => {
            function convertPriceOMR(inputStr) {
                // Remove commas
                let noCommasStr = inputStr.replace(/,/g, "");

                // Remove the last digit
                let resultStr = noCommasStr.slice(0, -1);

                return resultStr;
            }

            return Number(
                convertPriceOMR(
                    document.querySelector(
                        "tbody.table-padding-lg > tr:nth-child(3) > td.text-left > span"
                    ).innerText
                )
            );
        });
    } catch (error) {
        console.error("Scrape Failed:", error);
    } finally {
        await browser?.close();
    }
    console.log("OMR: ", omr_price, typeof omr_price);

    // scrape products
    try {
        browser = await puppeteer.launch({
            headless: true,
            defaultViewport: false,
            executablePath: executablePath(),
            args: [
                "--enable-gpu",
                "--disable-notifications",
                "--no-first-run",
                "--no-default-browser-check",
                "--disable-features=site-per-process",
            ],
        });
        const page = await browser.newPage();
        await page.setUserAgent(random_useragent.getRandom());
        await page.goto(url_products, { waitUntil: "domcontentloaded" });
        await page.addStyleTag({ content: "{scroll-behavior: auto !important;}" });

        // do it here
        await page.waitForSelector("div.new-filters > h4.section-title > span");

        // Click on the span containing 'Availability'
        await page.evaluate(() => {
            const availabilitySpan = Array.from(
                document.querySelectorAll("div.new-filters > h4.section-title > span")
            ).find((span) => span.textContent.includes("Availability"));
            if (availabilitySpan) {
                availabilitySpan.click();
            }
        });

        // Wait for the element with the specific href attribute to be available in the DOM
        await page.waitForSelector(
            "div.new-filters > ul > li:nth-child(2) > a[href='https://drnutrition.com/en-om/categories/In%20stock']"
        );

        // Click on the anchor tag with the specific href attribute
        await page.click(
            "div.new-filters > ul > li:nth-child(2) > a[href='https://drnutrition.com/en-om/categories/In%20stock']"
        );

        let products = [];
        while (true) {
            const handleProduct = await page.$$("[data-pid]");
            for (const product of handleProduct) {
                let title = "Null";
                let price = "Null";
                let imgSrc = "Null";

                const convertPrice = (price) => {
                    const match = price.match(/OMR\s*\d+(\.\d+)?/);
                    return match ? parseFloat(match[0].replace("OMR ", "")) : null;
                };
                try {
                    title = await page.evaluate(
                        (el) =>
                            el
                                .querySelector(".product-card-middle a.product-name")
                                .getAttribute("title"),
                        product
                    );
                } catch (error) {
                    console.error("Error While Scraping Products Title:", error);
                }
                try {
                    price = Math.ceil(
                        convertPrice(
                            await page.evaluate(
                                (el) =>
                                    el.querySelector(".product-card-bottom div.product-price")
                                        .innerText,
                                product
                            )
                        ) *
                            omr_price *
                            1.3
                    );
                } catch (error) {
                    console.error("Error While Scraping Products Price:", error);
                }
                try {
                    imgSrc = await page.evaluate(
                        (el) =>
                            el
                                .querySelector(".product-card-top a.product-image img")
                                .getAttribute("src"),
                        product
                    );
                } catch (error) {
                    console.error("Error While Scraping Products Image:", error);
                }
                if (title !== "Null") {
                    products.push({ title, price, imgSrc });
                }
            }

            // Check if the next page button has the .disabled class
            const isDisabled = await page.evaluate(() => {
                const nextPageButton = document.querySelector(
                    "li.page-item > button.page-link > i.la-angle-right"
                );
                return (
                    nextPageButton && nextPageButton.parentElement.classList.contains("disabled")
                );
            });

            if (isDisabled) {
                break; // Exit the loop if the next page button is disabled
            }

            // Click the next page button
            page.waitForNavigation();
            await page.waitForSelector("li.page-item > button.page-link > i.la-angle-right");
            await page.$$("li.page-item > button.page-link > i.la-angle-right");
            Promise.all([
                await page.evaluate(() =>
                    document
                        .querySelector("li.page-item > button.page-link > i.la-angle-right")
                        .click()
                ),
            ]);
        }

        console.log("Number Of Products: ", products.length, typeof products);

        fs.writeFile("data.json", JSON.stringify(products), (error) => {
            if (error) throw error;
            console.log("Data Saved Successfully!");
        });
    } catch (error) {
        console.error("Scrape Failed:", error);
    } finally {
        await browser?.close();
    }
})();
