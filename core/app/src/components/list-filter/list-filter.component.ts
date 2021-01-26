import {Component, Input, OnInit} from '@angular/core';
import {LanguageStore} from '@store/language/language.store';
import {DropdownButtonInterface} from '@app-common/components/button/dropdown-button.model';
import {ButtonInterface} from '@app-common/components/button/button.model';
import {deepClone} from '@base/app-common/utils/object-utils';
import {combineLatest, Observable} from 'rxjs';
import {filter, map, startWith, take} from 'rxjs/operators';
import {Field, FieldMap} from '@app-common/record/field.model';
import {SearchCriteria, SearchCriteriaFieldFilter} from '@app-common/views/list/search-criteria.model';
import {Filter, SearchMetaField, SearchMetaFieldMap} from '@app-common/metadata/list.metadata.model';
import {FieldManager} from '@services/record/field/field.manager';
import {ViewFieldDefinition} from '@app-common/metadata/metadata.model';
import {Record} from '@app-common/record/record.model';
import {AbstractControl, FormGroup} from '@angular/forms';
import {MessageService} from '@services/message/message.service';
import {FilterConfig} from '@components/list-filter/list-filter.model';
import {isVoid} from '@app-common/utils/value-utils';

export interface FilterDataSource {
    getFilter(): Observable<Filter>;
}

@Component({
    selector: 'scrm-list-filter',
    templateUrl: './list-filter.component.html',
    styleUrls: []
})
export class ListFilterComponent implements OnInit {

    @Input() config: FilterConfig;
    panelMode: 'collapsible' | 'closable' | 'none' = 'closable';
    mode = 'filter';
    isCollapsed = false;

    closeButton: ButtonInterface;
    myFilterButton: DropdownButtonInterface;
    quickSearchButton: ButtonInterface;

    gridButtons = [];

    fields: Field[] = [];
    special: Field[] = [];

    searchCriteria: SearchCriteria;

    vm$: Observable<any>;
    private record: Record;

    constructor(
        protected language: LanguageStore,
        protected fieldManager: FieldManager,
        protected message: MessageService
    ) {

    }

    ngOnInit(): void {

        this.vm$ = combineLatest([this.config.criteria$, this.config.searchFields$]).pipe(
            map(([criteria, searchFields]) => {
                this.reset();
                this.initFields(criteria, searchFields);

                return {criteria, searchFields};
            })
        );

        if (this.config.panelMode) {
            this.panelMode = this.config.panelMode;
        }

        if (!isVoid(this.config.isCollapsed)) {
            this.isCollapsed = this.config.isCollapsed;
        }

        this.reset();

        this.record = {
            module: this.config.module,
            attributes: {}
        } as Record;

        this.initGridButtons();
        this.initHeaderButtons();
    }

    /**
     * Initialize fields
     *
     * @param {object} criteria to use
     * @param {object} searchFields to use
     */
    initFields(criteria: SearchCriteria, searchFields: SearchMetaFieldMap): void {

        const fields = {} as FieldMap;
        const formControls = {} as { [key: string]: AbstractControl };

        Object.keys(searchFields).forEach(key => {
            const name = searchFields[key].name;

            fields[name] = this.buildField(searchFields[key], criteria);
            formControls[name] = fields[name].formControl;

            if (name.includes('_only')) {
                this.special.push(fields[name]);
            } else {
                this.fields.push(fields[name]);
            }
        });

        this.record.formGroup = new FormGroup(formControls);
    }

    /**
     * Reset criteria
     */
    protected reset(): void {
        this.searchCriteria = {
            filters: {},
        };

        this.fields = [];
        this.special = [];
    }

    /**
     * Initialize grid buttons
     */
    protected initGridButtons(): void {
        this.gridButtons = [
            {
                labelKey: 'LBL_CLEAR_BUTTON_LABEL',
                klass: ['clear-filters-button', 'btn', 'btn-outline-danger', 'btn-sm'],
                onClick: this.clearFilter.bind(this)
            },
            {
                labelKey: 'LBL_SEARCH_BUTTON_LABEL',
                klass: ['filter-button', 'btn', 'btn-danger', 'btn-sm'],
                onClick: this.applyFilter.bind(this)
            }
        ] as ButtonInterface[];
    }

    /**
     * Initialize header buttons
     */
    protected initHeaderButtons(): void {

        this.closeButton = {
            onClick: (): void => {
                this.config.onClose();
            }
        } as ButtonInterface;

        this.myFilterButton = {
            labelKey: 'LBL_SAVED_FILTER_SHORTCUT',
            klass: ['saved-filters-button', 'btn', 'btn-outline-light', 'btn-sm'],
            items: []
        } as DropdownButtonInterface;

        this.quickSearchButton = {
            labelKey: 'LBL_QUICK',
            klass: ['quick-filter-button', 'btn', 'btn-outline-light', 'btn-sm']
        };
    }

    /**
     * Build filter field according to Field interface
     *
     * @param {object} fieldMeta to use
     * @param {object} searchCriteria to use
     * @returns {object} Field
     */
    protected buildField(fieldMeta: SearchMetaField, searchCriteria: SearchCriteria): Field {
        const fieldName = fieldMeta.name;
        const type = fieldMeta.type;
        this.searchCriteria.filters[fieldName] = this.initFieldFilter(searchCriteria, fieldName, type);

        const definition = {
            name: fieldMeta.name,
            label: fieldMeta.label,
            type,
            fieldDefinition: {}
        } as ViewFieldDefinition;

        if (fieldMeta.fieldDefinition) {
            definition.fieldDefinition = fieldMeta.fieldDefinition;
        }

        if (type === 'bool' || type === 'boolean') {
            definition.fieldDefinition.options = 'dom_int_bool';
        }


        const field = this.fieldManager.buildFilterField(this.record, definition, this.language);

        field.criteria = this.searchCriteria.filters[fieldName];

        return field;
    }

    /**
     * Init filter fields
     *
     * @param {object} searchCriteria to use
     * @param {object} fieldName to init
     * @param {object} fieldType to init
     * @returns {object} SearchCriteriaFieldFilter
     */
    protected initFieldFilter(searchCriteria: SearchCriteria, fieldName: string, fieldType: string): SearchCriteriaFieldFilter {
        let fieldCriteria: SearchCriteriaFieldFilter;

        if (searchCriteria.filters[fieldName]) {
            fieldCriteria = deepClone(searchCriteria.filters[fieldName]);
        } else {
            fieldCriteria = {
                field: fieldName,
                fieldType,
                operator: '',
                values: []
            };
        }

        return fieldCriteria;
    }

    /**
     * Apply current filter values
     */
    protected applyFilter(): void {
        this.validate().pipe(take(1)).subscribe(valid => {

            if (valid) {
                this.config.onSearch();
                this.config.updateSearchCriteria(this.searchCriteria);
                return;
            }

            this.message.addWarningMessageByKey('LBL_VALIDATION_ERRORS');
        });

    }

    /**
     * Validate search current input
     *
     * @returns {object} Observable<boolean>
     */
    protected validate(): Observable<boolean> {

        this.record.formGroup.markAllAsTouched();
        return this.record.formGroup.statusChanges.pipe(
            startWith(this.record.formGroup.status),
            filter(status => status !== 'PENDING'),
            take(1),
            map(status => status === 'VALID')
        );
    }

    /**
     * Clear the current filter
     */
    protected clearFilter(): void {
        this.config.updateSearchCriteria({filters: {}}, false);
    }
}
