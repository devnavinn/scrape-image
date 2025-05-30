const express = require('express')
const puppeteer = require('puppeteer')
const axios = require('axios')
const archiver = require('archiver')

const app = express()
const PORT = 3000

app.get('/scrape-images', async (req, res) => {
    const { url } = req.query
    if (!url) return res.status(400).json({ error: 'url query param is required' })

    try {
        const browser = await puppeteer.launch({ headless: 'new' })
        const page = await browser.newPage()
        await page.goto(url, { waitUntil: 'networkidle2' })
        await page.waitForSelector('img', { timeout: 30000 })

        const imageUrls = await page.evaluate(() => {
            const urls = new Set()

            document.querySelectorAll('img').forEach((img) => {
                if (img.srcset) {
                    const srcList = img.srcset.split(',').map(s => s.trim())
                    let bestSrc = ''
                    let bestScale = 0

                    srcList.forEach(entry => {
                        const parts = entry.trim().split(' ')
                        if (parts.length < 2) return
                        const url = parts[0]
                        const scaleStr = parts[1]
                        const scale = parseFloat(scaleStr?.replace('x', '')) || 0

                        if (scale > bestScale && url.includes('behance.net/project_modules')) {
                            bestScale = scale
                            bestSrc = url
                        }
                    })


                    if (bestSrc) urls.add(bestSrc)
                } else if (img.src.includes('behance.net/project_modules')) {
                    urls.add(img.src)
                }
            })

            return Array.from(urls)
        })

        await browser.close()

        // ✅ Prepare zip archive in-memory
        res.set({
            'Content-Type': 'application/zip',
            'Content-Disposition': 'attachment; filename="behance_images.zip"'
        })

        const archive = archiver('zip', { zlib: { level: 9 } })
        archive.pipe(res)

        // ✅ Fetch each image and append to zip
        for (let imgUrl of imageUrls) {
            const response = await axios.get(imgUrl, { responseType: 'stream' })
            const fileName = imgUrl.split('/').pop().split('?')[0]
            archive.append(response.data, { name: fileName })
        }

        await archive.finalize()
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Failed to process the request' })
    }
})

app.listen(PORT, () => {
    console.log(`🚀 Server running at: http://localhost:${PORT}`)
})
