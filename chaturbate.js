/*
 *  Chaturbate plugin for Movian Media Center
 *
 *  Copyright (C) 2015-2018 lprot
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

var page = require('showtime/page');
var service = require('showtime/service');
var http = require('showtime/http');
var io = require('native/io');
var plugin = JSON.parse(Plugin.manifest);
var logo = Plugin.path + plugin.icon;

RichText = function(x) {
    this.str = x.toString();
}

RichText.prototype.toRichString = function(x) {
    return this.str;
}

var BASE_URL = 'https://chaturbate.com',
    UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/63.0.3239.84 Safari/537.36';

function setPageHeader(page, title) {
    page.type = "directory";
    page.contents = "items";
    page.metadata.logo = logo;
    page.metadata.title = new RichText(title);
}

var blue = '6699CC', orange = 'FFA500', red = 'EE0000', green = '008B45';
function coloredStr(str, color) {
    return '<font color="' + color + '">' + str + '</font>';
}

function trim(s) {
    if (s) return s.replace(/(\r\n|\n|\r)/gm, "").replace(/(^\s*)|(\s*$)/gi, "").replace(/[ ]{2,}/gi, " ").replace(/\t/g, '');
    return '';
}

service.create(plugin.title, plugin.id + ":start", 'tv', true, logo);

new page.Route(plugin.id + ":selectResolution:(.*):(.*)", function(page, url, title) {
    setPageHeader(page, unescape(title));
    page.loading = true;
    var html = http.request(BASE_URL + url).toString();
    var link = html.match(/"src='([\s\S]*?)'/);
    page.loading = false;
    if (!link) {
        page.error('Camera is offline');
        return;
    }

    page.loading = true;
    var m3u8 = http.request(link[1]).toString();
    page.loading = false;

    page.appendItem(plugin.id + ":play:" + escape(link[1]) + ':' + title, "video", {
        title: 'Auto'
    });

    var re = /RESOLUTION=([\s\S]*?)[\r|\n]([\s\S]*?)[$|\r|\n]/g;
    var match = re.exec(m3u8);
    while (match) {
        page.appendItem(plugin.id + ":play:" + escape(link[1].match(/^([\s\S]*?)playlist/)[1] + match[2]) + ':' + title, "video", {
            title: match[1]
        });
        match = re.exec(m3u8);
    }
    page.loading = false;
});


new page.Route(plugin.id + ":play:(.*):(.*)", function(page, url, title) {
    page.type = 'video';
    page.source = "videoparams:" + JSON.stringify({
        title: unescape(title),
        sources: [{
            url: 'hls:' + unescape(url)
        }],
        no_subtitle_scan: true
    });
    page.loading = false;
});

new page.Route(plugin.id + ":index:(.*):(.*)", function(page, url, title) {
    setPageHeader(page, unescape(title));
    var url = BASE_URL + url;

    tryToSearch = true;
    // 1-link, 2-icon, 3-label, 4-nick, 5-type/gender, 6-age, 7-description, 8-location, 9-stats
    var re = /<li>[\r\n|\r|\n].*<a href="([\s\S]*?)"[\s\S]*?<img src="([\s\S]*?)"[\s\S]*?<div class="thumbnail_label[\s\S]*?thumbnail_label[\s\S]*?">([\s\S]*?)<\/div>[\s\S]*?\/"> ([\s\S]*?)<\/a>[\s\S]*?<span class="age gender([\s\S]*?)">([\s\S]*?)<\/span>[\s\S]*?<li title="([\s\S]*?)">[\s\S]*?<li class="location"[\s\S]*?">([\s\S]*?)<\/li>[\s\S]*?<li class="cams">([\s\S]*?)<\/li>/g;

    function scrapeItems(blob) {
        var match = re.exec(blob);
        while (match) {
            var gender = match[5];
            if (match[5] == 'c') gender = 'couple';
            if (match[5] == 'f') gender = 'female';
            if (match[5] == 'm') gender = 'male';
            if (match[5] == 's') gender = 'shemale';
            page.appendItem(plugin.id + ":selectResolution:" + match[1] + ':' + escape(match[4]), "video", {
                title: new RichText(match[3].trim() + ' ' + coloredStr(match[4], orange) + ' (' + gender + ' ' + match[6] + ') ' + coloredStr(match[8], orange)),
                icon: match[2],
                description: new RichText(coloredStr('Status: ', orange) + match[9] +
                    coloredStr('\nLocation: ', orange) + match[8] +
                    (match[7] ? coloredStr('\nDescription: ', orange) + match[7] : null))
            });
            match = re.exec(blob);
        }
    }

    function loader() {
        if (!tryToSearch) return false;
        page.loading = true;
        var doc = http.request(url).toString();
        page.loading = false;
        var end = doc.indexOf('<ul class="paging">');
        if (end == -1)
            end = doc.indexOf('<div class="featured_blog_posts">');
        var blob = doc.substr(doc.indexOf('<ul class="list">'), end);
        if (blob) {
            scrapeItems(blob);
        } else {
            // 1-title, 2-blob, 3-end of blob
            var re2 = /class="callout">([\s\S]*?)<\/h([\s\S]*?)<h2>/g;
            var match2 = re2.exec(doc);
            while (match2) {
                page.appendItem("", "separator", {
                    title: match2[1]
                });
                scrapeItems(match2[2]);
                match2 = re2.exec(doc);
            }
        }
        var next = doc.match(/<link rel="next" href="([\s\S]*?)">/);
        if (!next) return tryToSearch = false;
        url = BASE_URL + next[1];
        return true;
    }
    loader();
    page.paginator = loader;
    page.loading = false;
});

new page.Route(plugin.id + ":start", function(page) {
    setPageHeader(page, plugin.title);
    page.loading = true;
    io.httpInspectorCreate('.*chaturbate\\.com', function(req) {
        req.setHeader('User-Agent', UA);
    });

    io.httpInspectorCreate('.*chaturbate\\.com.*', function(req) {
        req.setHeader('User-Agent', UA);
    });

    var doc = http.request('https://chaturbate.com').toString();
    // 1-section title, 2-block of links
    var re = /<div class="col[\s\S]*?<h2>([\s\S]*?)<\/h2>([\s\S]*?)<\/dl>/g;
    // 1-link, title
    var re2 = /<a href="([\s\S]*?)"[\s\S]*?>([\s\S]*?)<\/a>/g;
    var match = re.exec(doc);
    while (match) {
        page.appendItem("", "separator", {
            title: match[1]
        });
        var match2 = re2.exec(match[2]);
        while (match2) {
            page.appendItem(plugin.id + ":index:" + match2[1] + ':' + escape(match2[2]), "directory", {
                title: match2[2]
	    });
            match2 = re2.exec(match[2]);
        }
        match = re.exec(doc);
    }
    page.loading = false;
});
