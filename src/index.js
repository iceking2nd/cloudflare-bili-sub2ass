/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */
import DanmakuConverter from './sub2ass';
import { v4 as uuidv4 } from 'uuid';

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);
		switch (url.pathname.split('/')[1]){
			case 'subtitle':
				if (!url.searchParams.has('cid')) return new Response('cid is required', {status: 400});
				const converter = new DanmakuConverter();
				const assContent = await converter.xml2ass(
					url.searchParams.get('cid'),
					url.searchParams.has('width') ? parseInt(url.searchParams.get('width'), 10) : 1920,
					url.searchParams.has('height') ? parseInt(url.searchParams.get('height'), 10) : 1080,
					(1.0 - (url.searchParams.has('display_area')? parseFloat(url.searchParams.get('display_area')): 0.8)) * (url.searchParams.has('height') ? parseInt(url.searchParams.get('height'), 10) : 1080),
					url.searchParams.get('font') || '微软雅黑',
					url.searchParams.has('font_size') ? parseFloat(url.searchParams.get('font_size')) : 40.0,
					url.searchParams.has('alpha') ? parseFloat(url.searchParams.get('alpha')) : 0.8,
					url.searchParams.has('duration_marquee') ? parseFloat(url.searchParams.get('duration_marquee')) : 15.0,
					url.searchParams.has('duration_still') ? parseFloat(url.searchParams.get('duration_still')) : 5.0,
					null,
					null,
					url.searchParams.has('is_reduce_comments') ? url.searchParams.get('is_reduce_comments').toUpperCase() === "TRUE" : false
				);
				console.debug(assContent)
				return new Response(assContent, {status: 200,headers: {
						'Content-Type': 'text/plain; charset=utf-8',
						'Cache-Control': 'no-store',
						'Content-Disposition': `attachment; filename="${uuidv4()}.ass"`
				}});
		}
		return new Response('success', {status: 200,headers: {'Content-Type': 'text/plain', 'Cache-Control': 'no-store'}});
	},
};
