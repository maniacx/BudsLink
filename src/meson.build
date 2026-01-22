configure_file(
	input : APP_ID + '.js',
	output : APP_COMMAND,
	configuration: {
		'GJS': find_program('gjs').full_path(),
		'PACKAGE_NAME': APP_ID,
		'PACKAGE_VERSION': meson.project_version(),
		'PREFIX': get_option('prefix'),
		'LIBDIR': get_option('prefix') / get_option('libdir')
	},
	install_dir: get_option('bindir'),
	install_mode: 'rwxr-xr-x'
)

app_resource = gnome.compile_resources(
	APP_ID + '.src',
	APP_ID + '.src.gresource.xml',
	gresource_bundle: true,
	install: true,
	install_dir : get_option('datadir') / APP_ID
)

install_subdir(
  '../src/icons',
  install_dir: get_option('prefix'),
)

install_data(
  'icons/hicolor/scalable/apps/io.github.maniacx.BudsLink.svg',
  install_dir: get_option('datadir') / 'icons' / 'hicolor' / 'scalable' / 'apps'
)

install_data(
  'icons/hicolor/symbolic/apps/io.github.maniacx.BudsLink-symbolic.svg',
  install_dir: get_option('datadir') / 'icons' / 'hicolor' / 'symbolic' / 'apps'
)

gnome.post_install(
	gtk_update_icon_cache: true,
  update_desktop_database: true,
  glib_compile_schemas: true,
)
