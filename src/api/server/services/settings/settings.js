import path from 'path';
import fse from 'fs-extra';
import fs from 'fs';
import url from 'url';
import formidable from 'formidable';
import settings from '../../lib/settings';
import utils from '../../lib/utils';
import { db } from '../../lib/mongo';
import parse from '../../lib/parse';

class SettingsService {
	constructor() {
		this.defaultSettings = {
			domain: '',
			logo_file: null,
			language: 'en',
			currency_code: 'USD',
			currency_symbol: '$',
			currency_format: '${amount}',
			thousand_separator: ',',
			decimal_separator: '.',
			decimal_number: 2,
			timezone: 'Asia/Singapore',
			date_format: 'MMMM D, YYYY',
			time_format: 'h:mm a',
			default_shipping_country: 'SG',
			default_shipping_state: '',
			default_shipping_city: '',
			default_product_sorting: 'stock_status,price,position',
			product_fields:
				'path,id,name,category_id,category_name,sku,images,enabled,discontinued,stock_status,stock_quantity,price,on_sale,regular_price,attributes,tags,position',
			products_limit: 30,
			weight_unit: 'kg',
			length_unit: 'cm',
			hide_billing_address: false,
			order_confirmation_copy_to: ''
		};
	}

	getSettings() {
		return db
			.collection('settings')
			.findOne()
			.then(settings => {
				return this.changeProperties(settings);
			});
	}

	updateSettings(data) {
		const settings = this.getValidDocumentForUpdate(data);
		return this.insertDefaultSettingsIfEmpty().then(() =>
			db
				.collection('settings')
				.updateOne(
					{},
					{
						$set: settings
					},
					{ upsert: true }
				)
				.then(res => this.getSettings())
		);
	}

	insertDefaultSettingsIfEmpty() {
		return db
			.collection('settings')
			.countDocuments({})
			.then(count => {
				if (count === 0) {
					return db.collection('settings').insertOne(this.defaultSettings);
				} else {
					return;
				}
			});
	}

	getValidDocumentForUpdate(data) {
		if (Object.keys(data).length === 0) {
		  return new Error('Required fields are missing');
		}
	  
		const settings = {};
	  
		Object.keys(this.defaultSettings).forEach(key => {
		  if (data[key]!== undefined) {
			switch (key) {
			  case 'language':
			  case 'currency_code':
			  case 'domain':
			  case 'currency_symbol':
			  case 'currency_format':
			  case 'thousand_separator':
			  case 'decimal_separator':
			  case 'timezone':
			  case 'date_format':
			  case 'time_format':
			  case 'default_shipping_country':
			  case 'default_shipping_state':
			  case 'default_shipping_city':
			  case 'default_product_sorting':
			  case 'product_fields':
			  case 'weight_unit':
			  case 'length_unit':
			  case 'logo_file':
			  case 'order_confirmation_copy_to':
				settings[key] = parse.getString(data[key]);
				break;
			  case 'decimal_number':
				settings[key] = parse.getNumberIfPositive(data[key]) || 0;
				break;
			  case 'products_limit':
				settings[key] = parse.getNumberIfPositive(data[key]);
				break;
			  case 'hide_billing_address':
				settings[key] = parse.getBooleanIfValid(data[key], false);
				break;
			  default:
				throw new Error(`Unknown setting: ${key}`);
			}
		  }
		});
	  
		return settings;
	}

	changeProperties(settingsFromDB) {
		const data = Object.assign(this.defaultSettings, settingsFromDB, {
			_id: undefined
		});
		if (data.domain === null || data.domain === undefined) {
			data.domain = '';
		}

		if (data.logo_file && data.logo_file.length > 0) {
			data.logo = url.resolve(
				data.domain,
				settings.filesUploadUrl + '/' + data.logo_file
			);
		} else {
			data.logo = null;
		}
		return data;
	}

	deleteLogo() {
		return this.getSettings().then(data => {
			if (data.logo_file && data.logo_file.length > 0) {
				let filePath = path.resolve(
					settings.filesUploadPath + '/' + data.logo_file
				);
				fs.unlink(filePath, err => {
					this.updateSettings({ logo_file: null });
				});
			}
		});
	}

	uploadLogo(req, res, next) {
		let uploadDir = path.resolve(settings.filesUploadPath);
		fse.ensureDirSync(uploadDir);

		let form = new formidable.IncomingForm(),
			file_name = null,
			file_size = 0;

		form.uploadDir = uploadDir;

		form
			.on('fileBegin', (name, file) => {
				// Emitted whenever a field / value pair has been received.
				file.name = utils.getCorrectFileName(file.name);
				file.path = uploadDir + '/' + file.name;
			})
			.on('file', function(field, file) {
				// every time a file has been uploaded successfully,
				file_name = file.name;
				file_size = file.size;
			})
			.on('error', err => {
				res.status(500).send(this.getErrorMessage(err));
			})
			.on('end', () => {
				//Emitted when the entire request has been received, and all contained files have finished flushing to disk.
				if (file_name) {
					this.updateSettings({ logo_file: file_name });
					res.send({ file: file_name, size: file_size });
				} else {
					res
						.status(400)
						.send(this.getErrorMessage('Required fields are missing'));
				}
			});

		form.parse(req);
	}

	getErrorMessage(err) {
		return { error: true, message: err.toString() };
	}
}

export default new SettingsService();
