import numpy as np
from matplotlib import pyplot as plt
import json

nd = 10
nt = 4
fov = 45
d_min = 0.01
d_max = 200

d = np.logspace(np.log10(d_min), np.log10(d_max), nd)[:, None]
t = np.linspace(-fov / 2, fov / 2, nt)[None, :] * np.pi / 180
verts = np.empty((nd, nt, 2))
verts[..., 0] = d * np.cos(t)
verts[..., 1] = d * np.sin(t)
verts = verts.reshape((-1, 2))

vert_indices = np.arange(nd * nt).reshape((nd, nt))
tris = np.empty(((nd - 1) * (nt - 1) * 2, 3), dtype=int)
corner00 = vert_indices[:-1, :-1].flatten()
corner01 = vert_indices[1:, :-1].flatten()
corner10 = vert_indices[:-1, 1:].flatten()
corner11 = vert_indices[1:, 1:].flatten()
tris[::2, 0] = corner00
tris[::2, 1] = corner01
tris[::2, 2] = corner11
tris[1::2, 0] = corner00
tris[1::2, 1] = corner11
tris[1::2, 2] = corner10

with open('radial_mesh.js', 'w') as f:
    f.write('radial_mesh = ')
    json.dump(dict(verts=verts.tolist(), tris=tris.tolist()), f, indent=2)
    f.write(';')

plt.figure()
for tri in tris:
    plt.plot(*verts[tri[[0, 1, 2, 0]]].T)
plt.plot(*verts.T, 'ko', markersize=1)
plt.gca().set_aspect('equal')
plt.show()
