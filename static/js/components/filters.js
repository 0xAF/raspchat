/*
Copyright (c) 2015 Zohaib
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

(function (vue, win) {
  "use strict";

  var md = new win.markdownit("default", {
    linkify: true,
  });

  vue.filter('markdown', function (value) {
    return md.render(value);
  });

  vue.filter('better_date', function (value) {
    return win.moment(value).calendar();
  });

  vue.filter('escape_html', function (value) {
    return win.he.encode(value);
  });

  vue.filter('falsy_to_block_display', function (value) {
    return value ? 'block' : 'none';
  });

  vue.filter('friendly_progress', function (value) {
    if (~~value >= 100) {
      return 'almost done...';
    }

    return 'uploaded ' + value + '%';
  });


  var fragmentNode = document.createDocumentFragment();
  var virtualDiv = document.createElement('div');
  fragmentNode.appendChild(virtualDiv);
  vue.filter('emojify', function (value) {
    if (!win.emojify) {
      return value;
    }

    virtualDiv.innerHTML = value;
    win.emojify.run(virtualDiv);
    return virtualDiv.innerHTML;
  });

  vue.filter('avatar_url', function (value) {
    // return '//api.adorable.io/avatars/face/eyes6/nose7/face1/AA0000';
    return '//api.adorable.io/avatars/128/' + value + '-image.png';
    // return 'http://fileio.raspchat.com/img/?size=128&text=' + encodeURIComponent(value);
  });
})(window.Vue, window, window.document);
