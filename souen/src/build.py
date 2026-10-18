import base64, io, os, glob
from PIL import Image, ImageFilter
src=open('index.src.html').read()
# portraits -> upscaled webp data URIs
data={}
for p in sorted(glob.glob('assets/portraits/*.png')):
    k=os.path.splitext(os.path.basename(p))[0]
    im=Image.open(p).convert('RGB').resize((400,400), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=2, percent=70, threshold=2))
    b=io.BytesIO(); im.save(b,'WEBP',quality=88,method=6)
    data[k]='data:image/webp;base64,'+base64.b64encode(b.getvalue()).decode()
pj='const PORTRAIT_DATA = {\n'+',\n'.join(f'  {k}: "{v}"' for k,v in data.items())+'\n};\n'
order=['util','data','terrain','sprites','battle','audio','game']
js=pj+'\n'.join(open(f'js/{n}.js').read() for n in order)
assert '</script' not in js
out=src.replace('<!--SCRIPTS-->','<script>\n'+js+'\n</script>')
open('index.html','w').write(out)
print(len(out), 'portraits:', ', '.join(data))
