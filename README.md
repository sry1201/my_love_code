# my_love_code
我的表白代码仓库

# 本项目使用说明


## 启动说明： 

1、本地启动的话由于同源策略，心脏和字体访问的事本地，导致直接点击html打开心脏和心脏中的字不能显示，所以需要安装vs code 并安装插件live server 之后，右键html文件，选open with live server 启动，

2、 如果部署githubpage 或服务器的话， 好像打开的时候加载太慢了，不一定达到想要的效果，部署服务器可以考虑替换心脏走cdn加速。但是不一定达到效果

3、页面想要调整的话 可以全局搜索一下相关元素，不行问ai吧

4、理论上你们将项目中的心脏和字体文件切换成在线地址，直接右键html文件也是可以看到效果的，心脏： https://assets.codepen.io/127738/heart_2.obj



## 心脏字体切换说明

为了相应快速，我只放了一个杏字，

所以如果你们需要心脏中心显示其他字体，按如下不走操作：



下载支持中文的字体（TTF/OTF），如 Noto Sans SC：
https://fonts.google.com/noto/specimen/Noto+Sans+SC
打开字体转 Three.js JSON 的在线工具：
https://gero3.github.io/facetype.js/
在页面中：
点击 Choose file 上传下载的 NotoSansSC-Regular.ttf
Characters 输入框填入：杏（只导出这个字）
其他设置保持默认，点击 Generate
浏览器会下载一个 .typeface.json 文件
保存到本地项目：
新建文件夹 d:\windows\Desktop\Luv1\my_love_code\034\fonts\
将下载的文件重命名为 NotoSansSC_杏.typeface.json 放入该目录
建议文件名用纯英文避免编码问题，例如 NotoSansSC_subset.typeface.json 也可以



## 项目基础代码来源：



来自github 很棒的表白代码项目： https://github.com/sun0225SUN/Awesome-Love-Code?tab=readme-ov-file

基于项目中的030和034 ，然后找ai一起奋斗了6个夜晚才达到效果。 也许还能优化，但是七夕已过，毫无意义





## 其他：

部署服务器之后，莫名手机访问也可以打开，但是文字效果不好，如果你只是想要心脏和心脏中的文字效果的话，可以考虑去除右侧的文字显示效果，在手机上看也还行，。


左侧字控制了26秒后隐去，所以没加载完也会隐去，想保留字的可以看之前的提交记录 将隐去的代码注释。
