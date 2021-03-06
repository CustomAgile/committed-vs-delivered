/* global Ext Rally Constants Utils */
Ext.define("committed-vs-delivered", {
    extend: 'Rally.app.App',
    componentCls: 'app',
    layout: {
        type: 'vbox',
        align: 'stretch'
    },
    items: [
        {
            xtype: 'tabpanel',
            itemId: 'filterAndSettingsPanel',
            stateful: true,
            stateId: 'committed-v-delivered-filter-and-settings-panel',
            header: false,
            collapsible: true,
            animCollapse: false,
            cls: 'blue-tabs',
            activeTab: 0,
            plain: true,
            tabBar: {
                margin: '0 0 0 100'
            },
            autoRender: true,
            minTabWidth: 140,
            items: [
                {
                    title: 'Filters',
                    html: '',
                    itemId: 'filtersTab',
                    padding: 5,
                    items: [
                        {
                            id: Utils.AncestorPiAppFilter.RENDER_AREA_ID,
                            xtype: 'container',
                            layout: {
                                type: 'hbox',
                                align: 'middle',
                                defaultMargins: '0 10 10 0',
                            }
                        }, {
                            id: Utils.AncestorPiAppFilter.PANEL_RENDER_AREA_ID,
                            xtype: 'container',
                            layout: {
                                type: 'hbox',
                                align: 'middle',
                                defaultMargins: '0 10 10 0',
                            }
                        },
                    ]
                },
                {
                    title: 'Settings',
                    html: '',
                    itemId: 'settingsTab',
                    padding: 10,
                }
            ]
        },
        {
            xtype: 'container',
            itemId: 'controls-area',
            layout: 'hbox',
            margin: '10 0 0 0'
        },
        {
            id: 'grid-area',
            xtype: 'container',
            flex: 1,
            type: 'vbox',
            align: 'stretch'
        }
    ],
    config: {
        defaultSettings: {
            artifactType: 'HierarchicalRequirement',
            timeboxType: Constants.TIMEBOX_TYPE_ITERATION,
            timeboxCount: 3,
            planningWindow: 2,
            aggregationType: 'count',
            currentTimebox: true,
            respectTimeboxFilteredPage: false
        }
    },

    integrationHeaders: {
        name: "committed-vs-delivered"
    },

    currentData: [],

    launch: async function () {
        Rally.data.wsapi.Proxy.superclass.timeout = 180000;
        Rally.data.wsapi.batch.Proxy.superclass.timeout = 180000;
        this.labelWidth = 240;
        this.loading = true;
        this.down('#grid-area').on('resize', this.resizeChart, this);


        this.collapseBtn = Ext.widget('rallybutton', {
            text: this.down('#filterAndSettingsPanel').getCollapsed() ? 'Expand Filters and Settings' : 'Collapse',
            floating: true,
            shadow: false,
            height: 21,
            handler: (btn) => {
                this.down('#filterAndSettingsPanel').toggleCollapse();
                if (btn.getText() === 'Collapse') {
                    this.ancestorFilterPlugin.hideHelpButton();
                    btn.setText('Expand Filters and Settings');
                }
                else {
                    btn.setText('Collapse');
                    this.ancestorFilterPlugin.showHelpButton();
                }
            }
        });

        this.collapseBtn.showBy(this.down('#filterAndSettingsPanel'), 'tl-tl', [0, 3]);

        this.on('beforeshow', () => {
            if (this.down('#filterAndSettingsPanel').getActiveTab().title.indexOf('FILTERS') === -1) {
                setTimeout(() => this.ancestorFilterPlugin.hideHelpButton(), 1000);
            }
        });

        // If panel is collapsed, the multifilter help button isn't rendered in its proper place
        this.shouldCollapseSettings = this.down('#filterAndSettingsPanel').getCollapsed();
        this.down('#filterAndSettingsPanel').expand(false);

        this.addSettingItems();

        this.down('#' + Utils.AncestorPiAppFilter.RENDER_AREA_ID).add({
            xtype: 'rallybutton',
            itemId: 'applyFiltersBtn',
            handler: () => this.applyFilters(),
            text: 'Apply filters',
            cls: 'apply-filters-button',
            disabled: true
        });

        this.ancestorFilterPlugin = Ext.create('Utils.AncestorPiAppFilter', {
            ptype: 'UtilsAncestorPiAppFilter',
            pluginId: 'ancestorFilterPlugin',
            settingsConfig: { labelWidth: this.labelWidth },
            filtersHidden: false,
            projectScope: 'user',
            displayMultiLevelFilter: true,
            disableGlobalScope: true,
            visibleTab: this.down('#artifactTypeCombo').getValue(),
            listeners: {
                scope: this,
                ready(plugin) {
                    Rally.data.util.PortfolioItemHelper.getPortfolioItemTypes().then({
                        scope: this,
                        async success(portfolioItemTypes) {
                            this.portfolioItemTypes = _.sortBy(portfolioItemTypes, function (type) {
                                return type.get('Ordinal');
                            });
                            this.lowestPiType = this.portfolioItemTypes[0];
                            this.setModelFieldsForType(this.down('#artifactTypeCombo').getValue());
                            this.setTimeboxFieldsForType(this.down('#timeboxTypeCombo').getValue());

                            plugin.addListener({
                                scope: this,
                                select: this.filtersChange,
                                change: this.filtersChange
                            });

                            this.updateFilterTabText(plugin.getMultiLevelFilters());

                            this.down('#filterAndSettingsPanel').on('beforetabchange', (tabs, newTab) => {
                                if (newTab.title.indexOf('FILTERS') > -1) {
                                    this.ancestorFilterPlugin.showHelpButton();
                                }
                                else {
                                    this.ancestorFilterPlugin.hideHelpButton();
                                }
                            });

                            // If panel is collapsed, the multifilter help button isn't rendered in its proper place
                            if (this.shouldCollapseSettings) {
                                this.down('#filterAndSettingsPanel').collapse();
                                this.ancestorFilterPlugin.hideHelpButton();
                            }

                            this.loading = false;

                            if (localStorage.getItem(this.getContext().getScopedStateId('committedvdelivered-project-picker'))) {
                                this.ancestorFilterPlugin._setScopeControlToSpecific();
                                let checkBoxValue = Ext.state.Manager.get(this.getContext().getScopedStateId('committedvdelivered-scope-down-checkbox'));
                                await this.ancestorFilterPlugin._updatePickerFromOldPicker('committedvdelivered', checkBoxValue['checked']);
                            }

                            setTimeout(async () => {
                                if (this.ancestorFilterPlugin._isSubscriber() && this.down('#applyFiltersBtn')) {
                                    this.down('#applyFiltersBtn').hide();
                                }
                            }, 500);

                            this.applyFilters();
                        },
                        failure(msg) {
                            this.showError(msg);
                        },
                    });
                },
            }
        });
        this.addPlugin(this.ancestorFilterPlugin);
    },

    onTimeboxScopeChange: function () {
        this.callParent(arguments);
        this.viewChange();
    },

    filtersChange: function () {
        this.updateFilterTabText();

        if (this.ancestorFilterPlugin._isSubscriber()) {
            this.applyFilters();
        }
        else {
            this.down('#applyFiltersBtn').enable();
        }
    },

    applyFilters: async function () {
        this.ancestorAndMultiFilters = await this.ancestorFilterPlugin.getAllFiltersForType(this.down('#artifactTypeCombo').getValue(), true).catch((e) => {
            Rally.ui.notify.Notifier.showError({ message: (e.message || e) });
        });

        if (this.ancestorAndMultiFilters) {
            this.viewChange();
        }
    },

    setModelFieldsForType: function (artifactType) {
        this.modelName = artifactType;
        this.acceptedDateField = 'AcceptedDate';
        if (this.isPiTypeSelected()) {
            this.acceptedDateField = 'ActualEndDate'
        }
    },

    setTimeboxFieldsForType: function (timeboxType) {
        this.timeboxType = timeboxType;

        if (this.timeboxType == Constants.TIMEBOX_TYPE_RELEASE) {
            this.timeboxStartDateField = 'ReleaseStartDate';
            this.timeboxEndDateField = 'ReleaseDate';
        }
        else if (this.timeboxType == Constants.TIMEBOX_TYPE_ITERATION) {
            this.timeboxStartDateField = 'StartDate';
            this.timeboxEndDateField = 'EndDate'
        }
    },

    /**
     * Return a promise that resolves once the controls are initialized and
     * have initial values
     */
    addControls: function () {
        var context = this.getContext();
        var controlsArea = this.down('#controls-area');
        controlsArea.removeAll();
        controlsArea.add([
            {
                xtype: 'container',
                flex: 1
            }, {
                xtype: 'tsfieldpickerbutton',
                margin: '0 10 5 0',
                toolTipConfig: {
                    html: 'Columns to Export',
                    anchor: 'top'
                },
                getTitle: function () {
                    return 'Export Columns';
                },
                modelNames: [this.modelName],
                _fields: this.isPiTypeSelected() ? Constants.PI_DEFAULT_FIELDS : Constants.STORY_DEFAULT_FIELDS,
                context: context,
                stateful: true,
                stateId: context.getScopedStateId(this.modelName + 'fields'), // columns specific to type of object
                // Always need the accepted date field
                alwaysSelectedValues: Constants.ALWAYS_SELECTED_FIELDS.concat(this.acceptedDateField),
                listeners: {
                    fieldsupdated: function (fields) {
                        this.viewChange();
                    },
                    scope: this
                }
            }, {
                xtype: 'rallybutton',
                style: { 'float': 'right' },
                cls: 'secondary rly-small',
                frame: false,
                itemId: 'actions-menu-button',
                iconCls: 'icon-export',
                listeners: {
                    click: function (button) {
                        var menu = Ext.widget({
                            xtype: 'rallymenu',
                            items: [{
                                text: 'Export to CSV...',
                                handler: function () {
                                    var csvText = this.convertDataArrayToCSVText(this.currentData, this.getExportFieldsHash());
                                    CArABU.technicalservices.FileUtilities.saveCSVToFile(csvText, 'committed.csv');
                                },
                                scope: this
                            }]
                        });
                        menu.showBy(button.getEl());
                        if (button.toolTip) {
                            button.toolTip.hide();
                        }
                    },
                    scope: this
                }
            }]);
    },

    convertDataArrayToCSVText: function (data_array, requestedFieldHash) {
        var csv = [];
        let header = [];
        Ext.each(Object.keys(requestedFieldHash), function (key) {
            header.push(requestedFieldHash[key]);
        });
        csv.push(header);

        Ext.each(data_array, function (d) {
            let row = [];
            Ext.each(Object.keys(requestedFieldHash), function (key) {
                row.push(CustomAgile.ui.renderer.RecordFieldRendererFactory.getFieldDisplayValue(d, key, '; ', true));
            }, this);
            csv.push(row);
        }, this);
        return Papa.unparse(csv);
    },

    getFieldsFromButton: function () {
        var fieldPicker = this.down('tsfieldpickerbutton');
        var result = [];
        if (fieldPicker) {
            result = fieldPicker.getFields();
        }
        return result;
    },

    getExportFieldsHash: function () {
        var fields = this.getFieldsFromButton();
        // Special case, add the accepted date after all fields from the field picker so it
        // is next to the derirved fields instead of in the first column of export.
        // Use _.unique to remove duplicate as that field is also always selected.
        fields = _.without(fields, this.acceptedDateField);

        let aggregationType = this.down('#aggregationTypeCombo').getValue();
        if (aggregationType !== 'count') {
            fields.push(aggregationType);
        }

        fields.push(this.acceptedDateField);
        fields = fields.concat(Constants.DERIVED_FIELDS);

        return _.reduce(fields, function (accum, field) {
            accum[field] = this.headerName(field);
            return accum;
        }, {}, this);
    },

    headerName: function (field) {
        var result;
        switch (field) {
            case "Iteration":
                result = 'Currently linked to Iteration'
                break;
            case "Release":
                result = 'Currently linked to Release'
                break;
            case 'timeboxName':
                result = this.timeboxType;
                break;
            case 'timeboxStartDate':
                result = this.timeboxType + ' Start Date';
                break;
            case 'timeboxEndDate':
                result = this.timeboxType + ' End Date';
                break;
            case 'timeboxAddedDate':
                result = 'Linked to ' + this.timeboxType + ' on';
                break;
            default:
                result = field;
        }

        return result;
    },

    // Usual monkey business to size gridboards
    resizeChart: function () {
        // this.callParent(arguments);
        var gridArea = this.down('#grid-area');
        var gridboard = this.down('rallygridboard');
        if (gridArea && gridboard) {
            gridboard.setHeight(gridArea.getHeight())
        }
    },

    _buildChartConfig: function (status) {
        // Get the last N timeboxes
        this.setLoading('Loading Timeboxes...');
        return this.getTimeboxes().then({
            scope: this,
            success: function (timeboxGroups) {
                if (status.cancelLoad) {
                    return;
                }

                if (!Object.keys(timeboxGroups).length) {
                    this.showError('Failed to find timeboxes within the specified projects');
                    this.setLoading(false);
                    return;
                }

                this.setLoading('Loading Historical Data...');

                var promises = _.map(timeboxGroups, function (timeboxGroup) {
                    var timebox = timeboxGroup[0]; // Representative timebox for the group
                    var planningWindowEndIso = Ext.Date.add(timebox.get(this.timeboxStartDateField), Ext.Date.DAY, this.down('#planningWindowInput').getValue()).toISOString();
                    var timeboxEndIso = timebox.get(this.timeboxEndDateField).toISOString();
                    var timeboxStartIso = timebox.get(this.timeboxStartDateField).toISOString();
                    var snapshotByOid = {}

                    return this.getSnapshotsFromTimeboxGroup(timeboxGroup).then({
                        scope: this,
                        success: function (snapshots) {
                            if (status.cancelLoad) { return; }

                            if (!snapshots || snapshots.length === 0) {
                                return { timebox: timebox, artifacts: [] }
                            }
                            else {
                                snapshots = _.filter(_.flatten(snapshots), snap => this.isValidSnapshot(snap));

                                if (snapshots.length === 0) {
                                    return { timebox: timebox, artifacts: [] }
                                }

                                let oidQueries = [];
                                let filters = [];
                                let promises = [];
                                let dataContext = this.getContext().getDataContext();
                                let fetch = this.getFieldsFromButton();
                                let timeboxScope = this.getContext().getTimeboxScope();
                                let aggregationType = this.down('#aggregationTypeCombo').getValue();

                                _.each(snapshots, function (snapshot) {
                                    let oid = snapshot.get('ObjectID');
                                    oidQueries.push(oid);
                                    let previousValidFrom = snapshotByOid[oid] && snapshotByOid[oid].get('_ValidFrom');
                                    if (!previousValidFrom || snapshot.get('_ValidFrom') < previousValidFrom) {
                                        snapshotByOid[oid] = snapshot;
                                    }
                                }, this);

                                oidQueries = _.uniq(oidQueries);

                                if (this.ancestorAndMultiFilters && this.ancestorAndMultiFilters.length) {
                                    filters = filters.concat(this.ancestorAndMultiFilters);
                                }

                                if (timeboxScope && this.down('#respectTimeboxFilteredPageCheckbox').getValue()) {
                                    if (timeboxScope.type === 'iteration' && this.modelName === 'PortfolioItem/Feature') { }
                                    else {
                                        filters.push(timeboxScope.getQueryFilter());
                                    }
                                }

                                filters.push({
                                    property: 'ObjectID',
                                    operator: 'in',
                                    value: oidQueries
                                });

                                if (aggregationType !== 'count') {
                                    fetch.push(aggregationType);
                                }

                                // There are too many stories across the workspace, which results in timeouts when
                                // loading the story data with dataContext.project = null.
                                // So instead we scope to every project in the list which runs much faster
                                if (this.ancestorFilterPlugin.useSpecificProjects()) {
                                    dataContext.project = null;
                                    dataContext.projectScopeUp = false;
                                    dataContext.projectScopeDown = false;

                                    for (let p of this.projectRefs) {
                                        let context = Ext.clone(dataContext);
                                        context.project = p;

                                        let artifactStore = Ext.create('Rally.data.wsapi.Store', {
                                            model: this.modelName,
                                            context,
                                            fetch,
                                            autoLoad: false,
                                            enablePostGet: true,
                                            filters: filters,
                                            limit: Infinity,
                                            pageSize: 200
                                        });

                                        promises.push(artifactStore.load());
                                    }
                                }
                                else {
                                    let artifactStore = Ext.create('Rally.data.wsapi.Store', {
                                        model: this.modelName,
                                        context: dataContext,
                                        fetch,
                                        autoLoad: false,
                                        enablePostGet: true,
                                        filters: filters,
                                        limit: Infinity,
                                        pageSize: 200
                                    });

                                    promises.push(artifactStore.load());
                                }

                                this.setLoading('Loading Artifact Data...');

                                return Deft.Promise.all(promises).then({
                                    scope: this,
                                    success: function (artifacts) {
                                        if (status.cancelLoad) {
                                            return;
                                        }

                                        artifacts = _.flatten(artifacts);

                                        // Augment each artifact with Planned, Delivered and timebox Added Date
                                        _.each(artifacts, function (artifact) {
                                            var snapshot = snapshotByOid[artifact.get('ObjectID')];
                                            var validFrom = snapshot.get('_ValidFrom')
                                            if (validFrom <= planningWindowEndIso) {
                                                artifact.set('Planned', true);
                                            }
                                            var acceptedDate = artifact.get(this.acceptedDateField);
                                            if (acceptedDate) {
                                                var acceptedIso = acceptedDate.toISOString();
                                                if (acceptedIso <= timeboxEndIso) {
                                                    artifact.set('Delivered', true);
                                                }
                                                // Special case where artifact may be assigned to timeboxes that occur after
                                                // its accepted date. We may want to render these differently so they don't
                                                // show up as 'Delivered' in multiple timeboxes.
                                                if (acceptedIso < timeboxStartIso) {
                                                    artifact.set('AcceptedBeforeTimeboxStart', true);
                                                }
                                            }
                                            artifact.set('timeboxAddedDate', new Date(validFrom));
                                            artifact.set('timeboxName', timebox.get('Name'));
                                            artifact.set('timeboxStartDate', timebox.get(this.timeboxStartDateField));
                                            artifact.set('timeboxEndDate', timebox.get(this.timeboxEndDateField))
                                        }, this);
                                        return {
                                            timebox,
                                            artifacts
                                        }
                                    },
                                    failure: function (e) {
                                        this.showError(e, 'Failed while loading artifact data');
                                        this.setLoading(false);
                                    }
                                });
                            }
                        },
                        failure: function (e) {
                            this.setLoading(false);
                            this.showError(e, 'Failed while loading historical data. Request may have timed out.');
                            status.cancelLoad;
                        }
                    })
                }, this);
                return Deft.Promise.all(promises)
            }
        }).then({
            scope: this,
            success: function (data) {
                if (status.cancelLoad) {
                    return;
                }

                this.data = data;
                return this.getChartConfig(this.data);
            }
        });
    },

    // User may have copied an artifact in order to continue work in the next timebox
    // If the snapshot is valid for only a brief period of time, exclude it from the churn data
    isValidSnapshot(snap) {
        let diff = new Date(snap.get('_ValidTo')) - new Date(snap.get('_ValidFrom'));

        return typeof diff === 'number' && diff > 3600000;
    },

    getChartConfig: function (data) {
        if (!data) {
            return;
        }

        var sortedData = _.sortBy(data, function (datum) {
            return datum.timebox.get(this.timeboxStartDateField).toISOString();
        }, this);
        var timeboxNames = [];
        var plannedCommitted = [];
        var plannedDelivered = [];
        var unplannedComitted = [];
        var unplannedDelivered = [];
        let aggregationType = this.down('#aggregationTypeCombo').getValue();
        this.currentData = [];
        _.each(sortedData, function (datum, index, collection) {
            var pc = 0,
                pd = 0,
                uc = 0,
                ud = 0;

            var timeboxName = datum.timebox.get('Name');
            // If this is the current in-progress timebox, annotate its name
            if (this.down('#currentTimeboxCheckbox').getValue() && index == collection.length - 1) {
                if (datum.timebox.get(this.timeboxEndDateField) >= new Date()) {
                    timeboxName = timeboxName + Constants.IN_PROGRESS;
                }
            }
            timeboxNames.push(timeboxName);

            if (datum.artifacts) {
                for (let artifact of datum.artifacts) {
                    let artifactVal = aggregationType === 'count' ? 1 : artifact.get(aggregationType) || 0;
                    // if (artifact.get('AcceptedBeforeTimeboxStart')) {
                    //     // Special case. The artifact was accepted before the timebox started. The work occurred
                    //     // *before* this timebox started and is NOT therefore included in the timebox as committed
                    //     // or delivered.
                    //     console.log('AcceptedBeforeTimeboxStart', artifact);
                    // }
                    // else {
                    this.currentData.push(artifact.data);
                    if (artifact.get('Planned')) {
                        pc += artifactVal; // Committed and planned
                        if (artifact.get('Delivered')) {
                            pd += artifactVal; // Planned and delivered
                        }
                    }
                    else {
                        uc += artifactVal; // Comitted and unplanned 
                        if (artifact.get('Delivered')) {
                            ud += artifactVal // Unplanned and delivered
                        }
                    }
                    // }
                };
            }
            plannedCommitted.push(pc);
            plannedDelivered.push(pd);
            unplannedComitted.push(uc);
            unplannedDelivered.push(ud);
        }, this);

        var title = this.isPiTypeSelected() ? this.lowestPiType.get('Name') + 's' : 'Stories';

        return {
            xtype: 'rallychart',
            loadMask: false,
            chartColors: [
                "#FAD200", // $yellow
                "#8DC63F", // $lime
            ],
            chartConfig: {
                chart: {
                    type: 'column',
                    animation: false
                },
                title: {
                    text: title + ' ' + Constants.CHART_TITLE + ' by ' + this.timeboxType + (aggregationType === 'count' ? '' : ' (' + this.down('#aggregationTypeCombo').getDisplayValue() + ')')
                },
                legend: {
                    layout: 'vertical',
                    labelFormatter: function () {
                        var result = this.name;
                        if (this.name == Constants.UNPLANNED) {
                            var app = Rally.getApp();
                            var timeboxType = app.down('#timeboxTypeCombo').getValue();
                            var days = app.down('#planningWindowInput').getValue();
                            result = `${this.name} (added to ${timeboxType} more than ${days} day${days > 1 ? 's' : ''} after start)`;
                        }
                        return result;
                    }
                },
                plotOptions: {
                    column: {
                        stacking: 'normal'
                    },
                    series: {
                        animation: false,
                        dataLabels: {
                            align: 'center',
                            verticalAlign: 'top',
                        },
                        events: {
                            legendItemClick: function () { return false; } // Disable hiding some of data on legend click
                        }
                    }
                },
                yAxis: {
                    allowDecimals: false,
                    title: {
                        text: Constants.Y_AXIS_TITLE
                    }
                }
            },
            chartData: {
                categories: timeboxNames,
                series: [{
                    dataLabels: {
                        enabled: true,
                        format: '{total} ' + Constants.COMMITTED,
                        inside: false,
                        y: -20,
                        overflow: 'justify'
                    },
                    data: unplannedComitted,
                    stack: 0,
                    legendIndex: 2,
                    name: Constants.UNPLANNED
                }, {
                    data: plannedCommitted,
                    stack: 0,
                    legendIndex: 1,
                    name: Constants.PLANNED
                }, {
                    dataLabels: {
                        enabled: true,
                        format: '{total} ' + Constants.DELIVERED,
                        inside: false,
                        y: -20,
                        overflow: 'justify'
                    },
                    data: unplannedDelivered,
                    stack: 1,
                    showInLegend: false,
                    name: Constants.UNPLANNED
                }, {
                    data: plannedDelivered,
                    stack: 1,
                    showInLegend: false,
                    name: Constants.PLANNED
                }]
            }
        }
    },

    getTimeboxes: function () {
        // Get the N most recent timeboxes in the current project
        // Sort by name
        // Get timeboxes by name from all child projects

        var timeboxFilterProperty = this.timeboxEndDateField;
        if (this.down('#currentTimeboxCheckbox').getValue()) {
            timeboxFilterProperty = this.timeboxStartDateField;
        }
        let dataContext = this.getContext().getDataContext();
        dataContext.projectScopeDown = false;
        dataContext.projectScopeUp = false;
        let picker = this.down('#projectPicker');
        let projects = picker ? picker.getValue() : this.projectRefs;
        if (projects.length && picker) {
            dataContext.project = projects[0].get('_ref');
        } else {
            dataContext.project = this.projectRefs[0];
        }

        return Ext.create('Rally.data.wsapi.Store', {
            model: this.timeboxType,
            autoLoad: false,
            context: dataContext,
            sorters: [{
                property: timeboxFilterProperty,
                direction: 'DESC'
            }],
            filters: [{
                property: timeboxFilterProperty,
                operator: '<=',
                value: 'today'
            }],
            pageSize: this.down('#timeboxCountInput').getValue()
        }).load().then({
            scope: this,
            success: function (timeboxes) {
                var timeboxFilter = _.map(timeboxes, function (timebox) {
                    return Rally.data.wsapi.Filter.and([{
                        property: 'Name',
                        value: timebox.get('Name')
                    }, {
                        property: this.timeboxStartDateField,
                        value: timebox.get(this.timeboxStartDateField)
                    }, {
                        property: this.timeboxEndDateField,
                        value: timebox.get(this.timeboxEndDateField)
                    }]);
                }, this);
                if (timeboxFilter.length) {
                    timeboxFilter = Rally.data.wsapi.Filter.or(timeboxFilter);

                    if (this.ancestorFilterPlugin.useSpecificProjects()) {
                        timeboxFilter = timeboxFilter.and(new Rally.data.wsapi.Filter({
                            property: 'Project',
                            operator: 'in',
                            value: this.projectRefs
                        }));
                    }
                    return timeboxFilter;
                }
                else {
                    return null;
                }
            }
        }).then({
            scope: this,
            success: function (timeboxFilter) {
                if (timeboxFilter) {
                    let context = this.getContext().getDataContext();
                    if (this.ancestorFilterPlugin.useSpecificProjects()) {
                        context.project = null;
                    }

                    return Ext.create('Rally.data.wsapi.Store', {
                        model: this.timeboxType,
                        context: context,
                        autoLoad: false,
                        fetch: ['ObjectID', this.timeboxStartDateField, this.timeboxEndDateField, 'Name'],
                        enablePostGet: true,
                        limit: 10000,
                        pageSize: 10000,
                        sorters: [{
                            property: this.timeboxEndDateField,
                            direction: 'DESC'
                        }],
                        filters: [timeboxFilter]
                    }).load();
                }
                else {
                    return [];
                }
            }
        }).then({
            scope: this,
            success: function (timeboxes) {
                // Group by timebox name
                return _.groupBy(timeboxes, function (timebox) {
                    return timebox.get('Name');
                });
            }
        })
    },

    getSnapshotsFromTimeboxGroup: function (timeboxGroup) {
        var timebox = timeboxGroup[0]; // Representative timebox for the group
        var timeboxOids = _.map(timeboxGroup, function (timebox) {
            return timebox.get('ObjectID');
        });
        var timeboxEndIso = timebox.get(this.timeboxEndDateField).toISOString();
        var planningWindowEndIso = Ext.Date.add(timebox.get(this.timeboxStartDateField), Ext.Date.DAY, this.down('#planningWindowInput').getValue()).toISOString();
        var dataContext = this.getContext().getDataContext();

        var filters = [{
            property: '_TypeHierarchy',
            value: this.modelName
        },
        {
            property: '_ValidFrom',
            operator: '<=',
            value: timeboxEndIso
        },
        {
            property: '_ValidTo',
            operator: '>=',
            value: planningWindowEndIso
        }];

        if (this.isPiTypeSelected()) {
            filters.push({
                property: 'State',
                operator: '!=',
                value: 'Cancelled'
            });
        }


        if (this.ancestorFilterPlugin.useSpecificProjects()) {
            dataContext.project = null;
        }

        // if (this.projects && this.projects.length) {
        //     filters.push({
        //         property: 'Project',
        //         operator: this.projects.length === 1 ? '=' : 'in',
        //         value: this.projects.length === 1 ? this.projects[0] : this.projects
        //     });
        // }

        let promises = [];

        // if (timeboxOids.length <= 4) {
        //     filters.push({
        //         property: this.timeboxType,
        //         operator: timeboxOids.length === 1 ? '=' : 'in',
        //         value: timeboxOids.length === 1 ? timeboxOids[0] : timeboxOids
        //     });

        //     let store = Ext.create('Rally.data.lookback.SnapshotStore', {
        //         autoLoad: false,
        //         context: dataContext,
        //         fetch: [this.timeboxType, '_ValidFrom', '_ValidTo', 'ObjectID'],
        //         hydrate: [this.timeboxType],
        //         remoteSort: false,
        //         compress: true,
        //         enablePostGet: true,
        //         filters: filters,
        //         limit: 40000,
        //         includeTotalResultCount: false,
        //         removeUnauthorizedSnapshots: true
        //     });

        //     promises.push(store.load());
        // }
        // else {
        let chunks = this.chunk(timeboxOids, 4);

        for (let chunk of chunks) {
            let newFilter = filters.concat({
                property: this.timeboxType,
                operator: chunk.length === 1 ? '=' : 'in',
                value: chunk.length === 1 ? chunk[0] : chunk
            });

            let store = Ext.create('Rally.data.lookback.SnapshotStore', {
                autoLoad: false,
                context: dataContext,
                fetch: [this.timeboxType, '_ValidFrom', '_ValidTo', 'ObjectID'],
                hydrate: [this.timeboxType],
                remoteSort: false,
                compress: true,
                enablePostGet: true,
                filters: newFilter,
                limit: 40000,
                includeTotalResultCount: false,
                removeUnauthorizedSnapshots: true
            });

            promises.push(store.load());
        }
        //}

        return Deft.Promise.all(promises);
    },

    async _getScopedProjectList() {
        let projectStore = Ext.create('Rally.data.wsapi.Store', {
            model: 'Project',
            fetch: ['Name', 'ObjectID', 'Children', 'Parent'],
            filters: [{ property: 'ObjectID', value: this.getContext().getProject().ObjectID }],
            limit: 1,
            pageSize: 1,
            autoLoad: false
        });

        let results = await projectStore.load();
        let parents = [];
        let children = [];
        if (results && results.length) {
            if (this.getContext().getProjectScopeDown()) {
                children = await this._getAllChildProjects(results);
            }

            if (this.getContext().getProjectScopeUp()) {
                parents = await this._getAllParentProjects(results[0]);
            }

            if (children.length) {
                results = children.concat(parents);
            }
            else if (parents.length) {
                results = parents;
            }

            this.projects = _.map(results, (p) => {
                return p.get('ObjectID');
            });

            this.projectRefs = _.map(results, (p) => {
                return p.get('_ref');
            });
        }
        else {
            this.projects = [];
            this.projectRefs = [];
        }
    },
    async _getAllChildProjects(allRoots = [], fetch = ['Name', 'Children', 'ObjectID']) {
        if (!allRoots.length) { return []; }

        const promises = allRoots.map(r => this._wrap(r.getCollection('Children', { fetch, limit: Infinity, filters: [{ property: 'State', value: 'Open' }] }).load()));
        const children = _.flatten(await Promise.all(promises));
        const decendents = await this._getAllChildProjects(children, fetch);
        const removeDupes = {};
        let finalResponse = _.flatten([...decendents, ...allRoots, ...children]);

        // eslint-disable-next-line no-return-assign
        finalResponse.forEach(s => removeDupes[s.get('_ref')] = s);
        finalResponse = Object.values(removeDupes);
        return finalResponse;
    },
    async _getAllParentProjects(p) {
        let projectStore = Ext.create('Rally.data.wsapi.Store', {
            model: 'Project',
            fetch: ['Name', 'ObjectID', 'Parent'],
            filters: [{ property: 'ObjectID', value: p.get('Parent').ObjectID }],
            limit: 1,
            pageSize: 1,
            autoLoad: false
        });

        let results = await projectStore.load();
        if (results && results.length) {
            if (results[0].get('Parent')) {
                let parents = await this._getAllParentProjects(results[0]);
                return [p].concat(parents);
            }
            return [p, results[0]];
        }
        return [p];
    },
    async _wrap(deferred) {
        if (!deferred || !_.isFunction(deferred.then)) {
            return Promise.reject(new Error('Wrap cannot process this type of data into a ECMA promise'));
        }
        return new Promise((resolve, reject) => {
            deferred.then({
                success(...args) {
                    resolve(...args);
                },
                failure(error) {
                    reject(error);
                }
            });
        });
    },
    _addGridboard: function (chartConfig) {
        var gridArea = this.down('#grid-area');
        gridArea.removeAll();

        var context = this.getContext();
        this.gridboard = gridArea.add({
            xtype: 'rallygridboard',
            context: context,
            modelNames: [this.modelName],
            toggleState: 'chart',
            height: gridArea.getHeight() - Constants.APP_RESERVED_HEIGHT,
            chartConfig: chartConfig,
            listeners: {
                scope: this,
                viewchange: this.viewChange,
            }
        });
    },

    isPiTypeSelected: function () {
        let type = this.modelName || '';
        return type.toLowerCase().indexOf('portfolioitem') > -1;
    },

    addSettingItems: function () {
        var timeboxTypeStore = Ext.create('Ext.data.Store', {
            fields: ['name', 'value'],
            data: [
                { name: Constants.TIMEBOX_TYPE_ITERATION_LABEL, value: Constants.TIMEBOX_TYPE_ITERATION },
                { name: Constants.TIMEBOX_TYPE_RELEASE_LABEL, value: Constants.TIMEBOX_TYPE_RELEASE },
            ]
        });
        var typeStoreData = [
            { name: 'User Story', value: 'HierarchicalRequirement' },
            { name: 'Feature', value: 'PortfolioItem/Feature' }
        ];

        var artifactTypeStore = Ext.create('Ext.data.Store', {
            fields: ['name', 'value'],
            data: typeStoreData
        });

        var aggregationTypeStore = Ext.create('Ext.data.Store', {
            fields: ['name', 'value'],
            data: [
                { name: 'Count', value: 'count' },
                { name: 'Accepted Leaf Story Count', value: 'AcceptedLeafStoryCount' },
                { name: 'Accepted Leaf Story Plan Estimate Total', value: 'AcceptedLeafStoryPlanEstimateTotal' },
                { name: 'Actuals Total', value: 'Actuals' },
                { name: 'Estimate Total', value: 'Estimate' },
                { name: 'Leaf Story Count', value: 'LeafStoryCount' },
                { name: 'Leaf Story Plan Estimate Total', value: 'LeafStoryPlanEstimateTotal' },
                { name: 'Plan Estimate Total', value: 'PlanEstimate' },
                { name: 'Preliminary Estimate Total', value: 'PreliminaryEstimateValue' },
                { name: 'Refined Estimate Total', value: 'RefinedEstimate' }
            ]
        });

        let context = this.getContext();

        this.down('#settingsTab').add([{
            xtype: 'combobox',
            itemId: 'artifactTypeCombo',
            name: 'artifactType',
            value: this.getSetting('artifactType') || this.defaultSettings.artifactType,
            stateful: true,
            stateId: context.getScopedStateId('committedvdelivered-artifact-type-combo'),
            stateEvents: ['change'],
            fieldLabel: 'Artifact type',
            labelWidth: this.labelWidth,
            store: artifactTypeStore,
            queryMode: 'local',
            displayField: 'name',
            valueField: 'value',
            listeners: {
                scope: this,
                change: function (combo, newValue, oldValue) {
                    this.setModelFieldsForType(newValue);

                    // If Feature, also update timebox type to 'Release' and disable
                    // If change is fired due to setting state, timebox type 
                    // hasn't been created yet, so wait a bit first
                    setTimeout(() => {
                        let timeboxTypeControl = this.down('#timeboxTypeCombo');
                        if (timeboxTypeControl) {
                            if (this.isPiTypeSelected()) {
                                timeboxTypeControl.setValue(Constants.TIMEBOX_TYPE_RELEASE);
                                timeboxTypeControl.disable(); // User cannot pick other timeboxes for Features
                            }
                            else {
                                timeboxTypeControl.enable();
                            }
                        }

                        this.updateAggregationTypeCombo();
                    }, 300);

                    if (this.loading) {
                        return;
                    }

                    if (newValue != oldValue) {
                        this.showApplySettingsBtn();
                    }
                }
            }
        },
        {
            itemId: 'timeboxTypeCombo',
            xtype: 'combobox',
            value: this.getSetting('timeboxType'),
            disabled: this.getSetting('artifactType') === 'PortfolioItem/Feature',
            fieldLabel: 'Timebox type',
            labelWidth: this.labelWidth,
            store: timeboxTypeStore,
            stateful: true,
            stateId: context.getScopedStateId('committedvdelivered-timebox-type-combo'),
            stateEvents: ['change'],
            queryMode: 'local',
            displayField: 'name',
            valueField: 'value',
            listeners: {
                scope: this,
                change: function (combo, newValue, oldValue) {
                    this.setTimeboxFieldsForType(newValue);

                    if (this.loading) {
                        return;
                    }

                    if (newValue != oldValue) {
                        this.showApplySettingsBtn();
                    }
                }
            }
        },
        {
            xtype: 'rallynumberfield',
            itemId: 'timeboxCountInput',
            value: this.getSetting('timeboxCount'),
            fieldLabel: "Timebox Count",
            stateful: true,
            stateId: context.getScopedStateId('committedvdelivered-timebox-count-input'),
            stateEvents: ['change'],
            labelWidth: this.labelWidth,
            minValue: 1,
            allowDecimals: false,
            listeners: {
                scope: this,
                change: function () {
                    if (this.loading) {
                        return;
                    }

                    this.showApplySettingsBtn();
                }
            }
        }, {
            xtype: 'rallynumberfield',
            itemId: 'planningWindowInput',
            value: this.getSetting('planningWindow'),
            fieldLabel: 'Timebox planning window (days)',
            stateful: true,
            stateId: context.getScopedStateId('committedvdelivered-planning-window-input'),
            stateEvents: ['change'],
            labelWidth: this.labelWidth,
            minValue: 0,
            allowDecimals: false,
            listeners: {
                scope: this,
                change: function () {
                    if (this.loading) {
                        return;
                    }

                    this.showApplySettingsBtn();
                }
            }
        }, {
            itemId: 'aggregationTypeCombo',
            xtype: 'combobox',
            plugins: ['rallyfieldvalidationui'],
            fieldLabel: 'Aggregation Type',
            labelWidth: this.labelWidth,
            displayField: 'name',
            valueField: 'value',
            value: this.getSetting('aggregationType'),
            stateful: true,
            stateId: context.getScopedStateId('committedvdelivered-aggregation-type-combo'),
            stateEvents: ['change'],
            editable: false,
            allowBlank: false,
            queryMode: 'local',
            store: aggregationTypeStore,
            listeners: {
                scope: this,
                expand: this.updateAggregationTypeCombo,
                change: function (combo, newValue, oldValue) {
                    if (this.loading) {
                        return;
                    }

                    if (newValue != oldValue) {
                        this.showApplySettingsBtn();
                    }
                }
            }
        }, {
            xtype: 'rallycheckboxfield',
            itemId: 'currentTimeboxCheckbox',
            value: this.getSetting('currentTimebox'),
            fieldLabel: 'Show current, in-progress timebox',
            stateful: true,
            stateId: context.getScopedStateId('committedvdelivered-current-timebox-checkbox'),
            stateEvents: ['change'],
            labelWidth: this.labelWidth,
            listeners: {
                scope: this,
                change: function (combo, newValue, oldValue) {
                    if (this.loading) {
                        return;
                    }

                    if (newValue != oldValue) {
                        this.showApplySettingsBtn();
                    }
                }
            }
        }, {
            xtype: 'rallycheckboxfield',
            itemId: 'respectTimeboxFilteredPageCheckbox',
            value: this.getSetting('respectTimeboxFilteredPage'),
            fieldLabel: 'Respect filter on timebox filtered pages',
            labelWidth: this.labelWidth,
            stateful: true,
            stateId: context.getScopedStateId('committedvdelivered-respect-timebox-page-checkbox'),
            stateEvents: ['change'],
            listeners: {
                scope: this,
                change: function (field, newValue, oldValue) {
                    if (this.loading) {
                        return;
                    }

                    if (newValue != oldValue) {
                        this.showApplySettingsBtn();
                    }
                }
            }
        }, {
            xtype: 'rallybutton',
            itemId: 'applySettingsBtn',
            text: 'Apply',
            hidden: true,
            handler: function (btn) {
                btn.hide();
                this.viewChange();
            }.bind(this)
        }
        ]);
    },

    updateAggregationTypeCombo: function () {
        let aggregationTypeCombo = Rally.getApp().down('#aggregationTypeCombo');
        let artifactTypeCombo = Rally.getApp().down('#artifactTypeCombo');

        if (aggregationTypeCombo) {
            Rally.data.ModelFactory.getModel({
                type: artifactTypeCombo.getValue(),
                success: function (model) {
                    aggregationTypeCombo.store.filterBy(function (record) {
                        return record.get('value') === 'count' ||
                            model.hasField(record.get('value'));
                    });
                    if (!aggregationTypeCombo.store.findRecord('value', aggregationTypeCombo.getValue())) {
                        aggregationTypeCombo.setValue('count');
                    }
                },
                scope: this
            });
        }
    },



    showApplySettingsBtn: function () {
        this.down('#applySettingsBtn').show();
    },

    showApplyProjectsBtn: function () {
        this.down('#applyProjectsBtn') && this.down('#applyProjectsBtn').show();
    },

    updateFilterTabText: function (filters) {
        if (!filters) {
            filters = this.ancestorFilterPlugin.getMultiLevelFilters();
        }
        var totalFilters = 0;
        _.each(filters, function (filter) {
            totalFilters += filter.length;
        });

        var titleText = totalFilters ? `FILTERS (${totalFilters})` : 'FILTERS';
        var tab = this.down('#filterAndSettingsPanel').child('#filtersTab');

        if (tab) { tab.setTitle(titleText); }
    },

    viewChange: async function () {
        var gridArea = this.down('#grid-area');
        gridArea.removeAll();
        this.setLoading(true);
        this.addControls();
        if (this.down('#applyFiltersBtn')) { this.down('#applyFiltersBtn').disable(); }
        this.down('#applySettingsBtn').hide();
        if (this.down('#applyProjectsBtn')) { this.down('#applyProjectsBtn').hide(); }
        let status = this.cancelPreviousLoad();

        this.setLoading('Loading Projects...');

        if (this.ancestorFilterPlugin.useSpecificProjects()) {
            this.projects = await this.ancestorFilterPlugin.getProjectIDs();
            this.projectRefs = await this.ancestorFilterPlugin.getProjectRefs()
        } else {
            if (this.getContext().getProjectScopeDown() || this.getContext().getProjectScopeUp()) {
                await this._getScopedProjectList();
            }
            else {
                this.projects = [this.getContext().getProject().ObjectID];
                this.projectRefs = [this.getContext().getProject()._ref];
            }
        }

        if (!this.projects) {
            this.showError('Failed to fetch list of project IDs');
            this.setLoading(false);
            return;
        }

        this.artifactType = this.down('#artifactTypeCombo').getValue();

        this.setLoading('Loading Filters...');

        // If specific projects are selected, we'll be fetching artifacts on a per-project basis and therefore
        // don't need the project filter included in the multilevel filters
        if (this.ancestorFilterPlugin.useSpecificProjects()) {
            let ancestorFilter = this.ancestorFilterPlugin.getAncestorFilterForType(this.artifactType);
            let filters = ancestorFilter ? [ancestorFilter] : [];
            let multiFilters = await this.ancestorFilterPlugin.getMultiLevelFiltersForType(this.artifactType, true).catch((e) => {
                this.showError(e);
            });
            this.ancestorAndMultiFilters = multiFilters ? filters.concat(multiFilters) : null;
        }
        else {
            this.ancestorAndMultiFilters = await this.ancestorFilterPlugin.getAllFiltersForType(this.artifactType, true).catch((e) => {
                this.showError(e);
            });
        }

        if (!this.ancestorAndMultiFilters) { return; }

        this._buildChartConfig(status).then({
            scope: this,
            success: function (chartConfig) {
                if (status.cancelLoad) {
                    return;
                }

                this._addGridboard(chartConfig);
                this.setLoading(false);
                this.resizeChart();
            }
        });
    },

    cancelPreviousLoad: function () {
        if (this.globalStatus) {
            this.globalStatus.cancelLoad = true;
        }

        let newStatus = { cancelLoad: false };
        this.globalStatus = newStatus;
        return newStatus;
    },

    searchAllProjects() {
        return this.ancestorFilterPlugin.getIgnoreProjectScope();
    },

    getModelScopedStateId: function (modelName, id) {
        return this.getContext().getScopedStateId(modelName + '-' + id);
    },

    getSettingsFields: function () {
        var timeboxTypeStore = Ext.create('Ext.data.Store', {
            fields: ['name', 'value'],
            data: [
                { name: Constants.TIMEBOX_TYPE_ITERATION_LABEL, value: Constants.TIMEBOX_TYPE_ITERATION },
                { name: Constants.TIMEBOX_TYPE_RELEASE_LABEL, value: Constants.TIMEBOX_TYPE_RELEASE },
            ]
        });

        var artifactTypeStore = Ext.create('Ext.data.Store', {
            fields: ['name', 'value'],
            data: [
                { name: 'User Story', value: 'HierarchicalRequirement' },
                { name: 'Feature', value: 'PortfolioItem/Feature' },
            ]
        });

        return [{
            xtype: 'rallycombobox',
            name: 'artifactType',
            value: this.getSetting('artifactType'),
            fieldLabel: 'Artifact type',
            labelWidth: this.labelWidth,
            store: artifactTypeStore,
            queryMode: 'local',
            displayField: 'name',
            valueField: 'value',
            readyEvent: 'ready',
            bubbleEvents: ['typeselected'],
            listeners: {
                scope: this,
                ready: function (combo) {
                    setTimeout(function () { combo.fireEvent('typeselected', combo.getValue()); }, 400);
                },
                change: function (combo, newValue, oldValue) {
                    if (newValue != oldValue) {
                        this.updateSettingsValues({
                            settings: {
                                artifactType: newValue
                            }
                        });
                        // Choice of artifact has changed
                        this.setModelFieldsForType(newValue);
                        // If Feature, also update timebox type to 'Release'
                        var timeboxTypeControl = Ext.ComponentManager.get('timeboxType');
                        if (this.isPiTypeSelected()) {
                            timeboxTypeControl.setValue(Constants.TIMEBOX_TYPE_RELEASE);
                            timeboxTypeControl.disable(); // User cannot pick other timeboxes for Features
                        }
                        else {
                            timeboxTypeControl.enable();
                        }
                        combo.fireEvent('typeselected', combo.getValue());
                    }
                }
            }
        },
        {
            xtype: 'rallycombobox',
            name: 'timeboxType',
            id: 'timeboxType',
            value: this.getSetting('timeboxType'),
            fieldLabel: 'Timebox type',
            labelWidth: this.labelWidth,
            store: timeboxTypeStore,
            queryMode: 'local',
            displayField: 'name',
            valueField: 'value',
            disabled: this.isPiTypeSelected(),
            listeners: {
                scope: this,
                change: function (field, newValue, oldValue) {
                    if (newValue != oldValue) {
                        this.updateSettingsValues({
                            settings: {
                                timeboxType: newValue
                            }
                        });
                        // Choice of timebox has changed
                        this.setTimeboxFieldsForType(newValue);
                    }
                }
            }
        },
        {
            xtype: 'rallynumberfield',
            name: 'timeboxCount',
            value: this.getSetting('timeboxCount'),
            fieldLabel: "Timebox Count",
            labelWidth: this.labelWidth,
            minValue: 1,
            allowDecimals: false,
            listeners: {
                scope: this,
                change: function (field, newValue, oldValue) {
                    if (newValue != oldValue) {
                        this.updateSettingsValues({
                            settings: {
                                timeboxCount: newValue
                            }
                        });
                    }
                }
            }
        }, {
            xtype: 'rallynumberfield',
            name: 'planningWindow',
            value: this.getSetting('planningWindow'),
            fieldLabel: 'Timebox planning window (days)',
            labelWidth: this.labelWidth,
            minValue: 0,
            allowDecimals: false,
            listeners: {
                scope: this,
                change: function (field, newValue, oldValue) {
                    if (newValue != oldValue) {
                        this.updateSettingsValues({
                            settings: {
                                planningWindow: newValue
                            }
                        });
                    }
                }
            }
        }, {
            name: 'aggregationType',
            xtype: 'rallycombobox',
            plugins: ['rallyfieldvalidationui'],
            fieldLabel: 'Aggregation Type',
            labelWidth: this.labelWidth,
            displayField: 'name',
            valueField: 'value',
            value: this.getSetting('aggregationType'),
            editable: false,
            allowBlank: false,
            store: {
                fields: ['name', 'value'],
                data: [
                    { name: 'Count', value: 'count' },
                    { name: 'Accepted Leaf Story Count', value: 'AcceptedLeafStoryCount' },
                    { name: 'Accepted Leaf Story Plan Estimate Total', value: 'AcceptedLeafStoryPlanEstimateTotal' },
                    { name: 'Actuals Total', value: 'Actuals' },
                    { name: 'Estimate Total', value: 'Estimate' },
                    { name: 'Leaf Story Count', value: 'LeafStoryCount' },
                    { name: 'Leaf Story Plan Estimate Total', value: 'LeafStoryPlanEstimateTotal' },
                    { name: 'Plan Estimate Total', value: 'PlanEstimate' },
                    { name: 'Preliminary Estimate Total', value: 'PreliminaryEstimateValue' },
                    { name: 'Refined Estimate Total', value: 'RefinedEstimate' }
                ]
            },
            lastQuery: '',
            listeners: {
                scope: this,
                change: function (field, newValue, oldValue) {
                    if (newValue != oldValue) {
                        this.updateSettingsValues({
                            settings: {
                                aggregationType: newValue
                            }
                        });
                    }
                }
            },
            handlesEvents: {
                typeselected: function (types) {
                    var type = Ext.Array.from(types)[0];
                    Rally.data.ModelFactory.getModel({
                        type: type,
                        success: function (model) {
                            this.store.filterBy(function (record) {
                                return record.get('value') === 'count' ||
                                    model.hasField(record.get('value'));
                            });
                            if (!this.store.findRecord('value', this.getValue())) {
                                this.setValue('count');
                            }
                        },
                        scope: this
                    });

                }
            },
        }, {
            xtype: 'rallycheckboxfield',
            name: 'currentTimebox',
            value: this.getSetting('currentTimebox'),
            fieldLabel: 'Show current, in-progress timebox',
            labelWidth: this.labelWidth,
            listeners: {
                scope: this,
                change: function (field, newValue, oldValue) {
                    if (newValue != oldValue) {
                        this.updateSettingsValues({
                            settings: {
                                currentTimebox: newValue
                            }
                        });
                    }
                }
            }
        }, {
            xtype: 'rallycheckboxfield',
            name: 'respectTimeboxFilteredPage',
            value: this.getSetting('respectTimeboxFilteredPage'),
            fieldLabel: 'Respect filter on timebox filtered pages',
            labelWidth: this.labelWidth,
            listeners: {
                scope: this,
                change: function (field, newValue, oldValue) {
                    if (newValue != oldValue) {
                        this.updateSettingsValues({
                            settings: {
                                respectTimeboxFilteredPage: newValue
                            }
                        });
                    }
                }
            }
        }
        ]
    },

    showError(msg, defaultMsg) {
        Rally.ui.notify.Notifier.showError({ message: this.parseError(msg, defaultMsg) });
    },

    parseError(e, defaultMessage) {
        defaultMessage = defaultMessage || 'An error occurred while loading the report';

        if (typeof e === 'string' && e.length) {
            return e;
        }
        if (e.message && e.message.length) {
            return e.message;
        }
        if (e.exception && e.error && e.error.errors && e.error.errors.length) {
            if (e.error.errors[0].length) {
                return e.error.errors[0];
            } else {
                if (e.error && e.error.response && e.error.response.status) {
                    return `${defaultMessage} (Status ${e.error.response.status})`;
                }
            }
        }
        if (e.exceptions && e.exceptions.length && e.exceptions[0].error) {
            return e.exceptions[0].error.statusText;
        }
        return defaultMessage;
    },

    baseSlice: function (array, start, end) {
        var index = -1,
            length = array.length;

        if (start < 0) {
            start = -start > length ? 0 : (length + start);
        }
        end = end > length ? length : end;
        if (end < 0) {
            end += length;
        }
        length = start > end ? 0 : ((end - start) >>> 0);
        start >>>= 0;

        var result = Array(length);
        while (++index < length) {
            result[index] = array[index + start];
        }
        return result;
    },

    chunk: function (array, size) {
        var length = array == null ? 0 : array.length;
        if (!length || size < 1) {
            return [];
        }
        var index = 0,
            resIndex = 0,
            result = Array(Math.ceil(length / size));

        while (index < length) {
            result[resIndex++] = this.baseSlice(array, index, (index += size));
        }
        return result;
    },

    setLoading(msg) {
        this.down('#grid-area').setLoading(msg);
    },

    showSettings: function () {
        if (this.collapseBtn) {
            this.collapseBtn.hide();
        }
        this.callParent(arguments);
    },

    hideSettings: function () {
        if (this.collapseBtn) {
            this.collapseBtn.show();
        }
        this.callParent(arguments);
    }
});
