import glob, os, unittest
try:
    import yaml
except ImportError:
    yaml = None

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')


@unittest.skipIf(yaml is None, 'PyYAML tiada')
class T(unittest.TestCase):
    def test_semua_workflow_yaml_sah(self):
        # 14 Nov 2026: "run: \"x\" y" (petikan diikuti teks) tidak sah → GitHub gagalkan larian serta-merta tanpa log
        files = glob.glob(os.path.join(ROOT, '.github', 'workflows', '*.yml'))
        self.assertTrue(files)
        for f in files:
            with self.subTest(f=os.path.basename(f)):
                d = yaml.safe_load(open(f, encoding='utf-8'))
                self.assertIn('jobs', d)

    def test_deploy_hanya_bila_fail_apps_script_berubah(self):
        # Setiap deploy menggunakan satu daripada had 200 versi Apps Script (19 Nov 2026: had tercapai). PR dokumen/data tidak patut menggunakan versi.
        d = yaml.safe_load(open(os.path.join(ROOT, '.github', 'workflows', 'deploy.yml'), encoding='utf-8'))
        on = d.get('on', d.get(True))   # PyYAML membaca kunci "on" sebagai True
        self.assertEqual(on['push']['branches'], ['main'])
        for f in ('Code.gs', 'Index.html', 'IndexUji.html', 'appsscript.json'):
            self.assertIn(f, on['push']['paths'])
        for f in ('CLAUDE.md', 'README.md'):
            self.assertNotIn(f, on['push']['paths'])
        self.assertIn('workflow_dispatch', on)   # deploy paksa dari Actions


if __name__ == '__main__':
    unittest.main()
